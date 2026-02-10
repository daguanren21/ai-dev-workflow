export interface TokenAuth {
  type: 'token'
  tokenEnv: string
}

export interface BasicAuth {
  type: 'basic'
  usernameEnv: string
  passwordEnv: string
}

export interface OAuth2Auth {
  type: 'oauth2'
  clientIdEnv: string
  clientSecretEnv: string
  tokenUrl: string
}

export interface CookieAuth {
  type: 'cookie'
  cookieEnv: string
}

export interface CustomAuth {
  type: 'custom'
  headerName: string
  valueEnv: string
}

/**
 * ONES uses OAuth2 PKCE. Requires email + password → RSA-encrypted login → PKCE code flow → Bearer token.
 * The adapter handles this internally; config only needs credentials.
 */
export interface OnesPkceAuth {
  type: 'ones-pkce'
  emailEnv: string
  passwordEnv: string
}

export type AuthConfig = TokenAuth | BasicAuth | OAuth2Auth | CookieAuth | CustomAuth | OnesPkceAuth
