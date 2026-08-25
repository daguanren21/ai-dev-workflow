import type { SourceConfig } from '../../types/config'
import type { OnesSession } from './types'
import crypto from 'node:crypto'

interface OnesTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface OnesLoginResponse {
  sid: string
  auth_user_uuid: string
  org_users: Array<{
    region_uuid: string
    org_uuid: string
    org_user: { org_user_uuid: string, name: string }
    org: { org_uuid: string, name: string }
  }>
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function getSetCookies(response: Response): string[] {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] }
  if (headers.getSetCookie)
    return headers.getSetCookie()
  const raw = response.headers.get('set-cookie')
  return raw ? [raw] : []
}

function parseRedirectValue(location: string, names: string[]): string | null {
  try {
    const parsed = new URL(location)
    for (const name of names) {
      const value = parsed.searchParams.get(name)
      if (value)
        return value
    }
    return null
  }
  catch {
    const match = location.match(new RegExp(`[?&](?:${names.join('|')})=([^&#]+)`))
    return match?.[1] ? decodeURIComponent(match[1]) : null
  }
}

export class OnesApiClient {
  private session: OnesSession | null = null

  constructor(
    private readonly config: SourceConfig,
    private readonly resolvedAuth: Record<string, string>,
  ) {}

  async getSession(): Promise<OnesSession> {
    if (this.session && Date.now() < this.session.expiresAt)
      return this.session

    const baseUrl = this.config.apiBase
    const email = this.resolvedAuth.email
    const password = this.resolvedAuth.password
    if (!email || !password)
      throw new Error('ONES auth requires email and password (ones-pkce auth type)')

    const certRes = await fetch(`${baseUrl}/identity/api/encryption_cert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!certRes.ok)
      throw new Error(`ONES: Failed to get encryption cert: ${certRes.status}`)
    const cert = await certRes.json() as { public_key: string }
    const encryptedPassword = crypto.publicEncrypt(
      { key: cert.public_key, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(password, 'utf-8'),
    ).toString('base64')

    const loginRes = await fetch(`${baseUrl}/identity/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: encryptedPassword }),
    })
    if (!loginRes.ok)
      throw new Error(`ONES: Login failed with status ${loginRes.status}`)

    const cookies = getSetCookies(loginRes).map(cookie => cookie.split(';')[0]).join('; ')
    const loginData = await loginRes.json() as OnesLoginResponse
    const configuredOrgUuid = this.config.options?.orgUuid as string | undefined
    const orgUser = configuredOrgUuid
      ? loginData.org_users.find(user => user.org_uuid === configuredOrgUuid) ?? loginData.org_users[0]
      : loginData.org_users[0]
    if (!orgUser)
      throw new Error('ONES: No organizations found for this user')

    const codeVerifier = base64Url(crypto.randomBytes(32))
    const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest())
    const authorizeParams = new URLSearchParams({
      client_id: 'ones.v1',
      scope: `openid offline_access ones:org:${orgUser.region_uuid}:${orgUser.org_uuid}:${orgUser.org_user.org_user_uuid}`,
      response_type: 'code',
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: `${baseUrl}/auth/authorize/callback`,
      state: `org_uuid=${orgUser.org_uuid}`,
    })
    const authorizeRes = await fetch(`${baseUrl}/identity/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies },
      body: authorizeParams.toString(),
      redirect: 'manual',
    })
    const authorizeLocation = authorizeRes.headers.get('location')
    if (!authorizeLocation)
      throw new Error('ONES: Authorize response missing location header')

    let code = parseRedirectValue(authorizeLocation, ['code'])
    if (!code) {
      const authRequestId = parseRedirectValue(authorizeLocation, ['auth_request_id', 'id'])
      if (!authRequestId)
        throw new Error('ONES: Cannot parse auth_request_id from authorize redirect')
      const finalizeRes = await fetch(`${baseUrl}/identity/api/auth_request/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=UTF-8', 'Cookie': cookies },
        body: JSON.stringify({
          auth_request_id: authRequestId,
          region_uuid: orgUser.region_uuid,
          org_uuid: orgUser.org_uuid,
          org_user_uuid: orgUser.org_user.org_user_uuid,
        }),
      })
      if (!finalizeRes.ok)
        throw new Error(`ONES: Finalize failed with status ${finalizeRes.status}`)
      const callbackRes = await fetch(
        `${baseUrl}/identity/authorize/callback?id=${authRequestId}&lang=zh`,
        { method: 'GET', headers: { Cookie: cookies }, redirect: 'manual' },
      )
      const callbackLocation = callbackRes.headers.get('location')
      if (!callbackLocation)
        throw new Error('ONES: Callback response missing location header')
      code = parseRedirectValue(callbackLocation, ['code'])
    }
    if (!code)
      throw new Error('ONES: Cannot parse authorization code from callback redirect')

    const tokenRes = await fetch(`${baseUrl}/identity/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'ones.v1',
        code,
        code_verifier: codeVerifier,
        redirect_uri: `${baseUrl}/auth/authorize/callback`,
      }).toString(),
    })
    if (!tokenRes.ok)
      throw new Error(`ONES: Token exchange failed with status ${tokenRes.status}`)
    const token = await tokenRes.json() as OnesTokenResponse

    const teamsRes = await fetch(
      `${baseUrl}/project/api/project/organization/${orgUser.org_uuid}/stamps/data?t=org_my_team`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': 'application/json;charset=UTF-8',
        },
        body: JSON.stringify({ org_my_team: 0 }),
      },
    )
    if (!teamsRes.ok)
      throw new Error(`ONES: Failed to fetch teams: ${teamsRes.status}`)
    const teamsData = await teamsRes.json() as {
      org_my_team?: { teams?: Array<{ uuid: string, name: string }> }
    }
    const teams = teamsData.org_my_team?.teams ?? []
    const configuredTeamUuid = this.config.options?.teamUuid as string | undefined
    const teamUuid = configuredTeamUuid
      ? teams.find(team => team.uuid === configuredTeamUuid)?.uuid ?? teams[0]?.uuid
      : teams[0]?.uuid
    if (!teamUuid)
      throw new Error('ONES: No teams found for this user')

    this.session = {
      accessToken: token.access_token,
      teamUuid,
      orgUuid: orgUser.org_uuid,
      userUuid: orgUser.org_user.org_user_uuid,
      userName: orgUser.org_user.name,
      expiresAt: Date.now() + (token.expires_in - 60) * 1000,
    }
    return this.session
  }

  async graphql<T>(query: string, variables: Record<string, unknown>, tag?: string): Promise<T> {
    const session = await this.getSession()
    const path = `/project/api/project/team/${session.teamUuid}/items/graphql${tag ? `?t=${encodeURIComponent(tag)}` : ''}`
    const response = await this.authorizedFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (!response.ok)
      throw new Error(`ONES GraphQL error: ${response.status}`)
    return response.json() as Promise<T>
  }

  async onesql<T>(query: string, variables: Record<string, unknown>, workItemType: string): Promise<T> {
    const session = await this.getSession()
    const response = await this.authorizedFetch(
      `/project/api/ones-project/team/${session.teamUuid}/workitems/onesql`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: [variables, workItemType, null, null] }),
      },
    )
    if (!response.ok)
      throw new Error(`ONES OneSQL error: ${response.status}`)
    return response.json() as Promise<T>
  }

  async authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const session = await this.getSession()
    const headers = {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      Authorization: `Bearer ${session.accessToken}`,
    }
    return fetch(new URL(path, this.config.apiBase).toString(), { ...init, headers })
  }
}
