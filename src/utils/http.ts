import type { AuthConfig } from '../types/auth.js'
import type { SourceConfig } from '../types/config.js'

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
  params?: Record<string, string>
  headers?: Record<string, string>
}

/**
 * Build auth headers based on the auth config and resolved env values.
 */
function buildAuthHeaders(
  auth: AuthConfig,
  resolvedAuth: Record<string, string>,
): Record<string, string> {
  switch (auth.type) {
    case 'token':
      return { Authorization: `Bearer ${resolvedAuth.token}` }
    case 'basic': {
      const credentials = Buffer.from(
        `${resolvedAuth.username}:${resolvedAuth.password}`,
      ).toString('base64')
      return { Authorization: `Basic ${credentials}` }
    }
    case 'oauth2':
      return { Authorization: `Bearer ${resolvedAuth.clientSecret}` }
    case 'cookie':
      return { Cookie: resolvedAuth.cookie }
    case 'custom':
      return { [auth.headerName]: resolvedAuth.value }
    case 'ones-pkce':
      // ONES PKCE adapter handles auth internally; no static headers needed
      return {}
  }
}

/**
 * Fetch wrapper with automatic auth injection and error handling.
 * Uses Node 20 native fetch.
 */
export async function authFetch<T = unknown>(
  sourceConfig: SourceConfig,
  resolvedAuth: Record<string, string>,
  options: FetchOptions,
): Promise<T> {
  const { method = 'GET', path, body, params, headers: extraHeaders } = options

  const url = new URL(path, sourceConfig.apiBase)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }

  const authHeaders = buildAuthHeaders(sourceConfig.auth, resolvedAuth)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...authHeaders,
    ...sourceConfig.headers,
    ...extraHeaders,
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `HTTP ${response.status} ${response.statusText} from ${method} ${url.pathname}: ${text}`,
    )
  }

  return response.json() as Promise<T>
}
