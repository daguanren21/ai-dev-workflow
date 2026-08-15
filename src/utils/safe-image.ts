import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export type RemoteImageTrust = 'configured-origin' | 'source-issued' | 'untrusted'

export interface RemoteImage {
  base64: string
  mimeType: string
}

interface DownloadOptions {
  classifyUrl: (url: string) => RemoteImageTrust
  fetchImpl?: typeof fetch
  lookupHost?: typeof lookup
  maxBytes?: number
  maxRedirects?: number
  timeoutMs?: number
}

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_REDIRECTS = 3
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_IMAGES = 8
const MAX_CONCURRENCY = 4
const ALLOWED_IMAGE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255))
    return false

  const [a, b, c] = octets
  if (a === 0 || a === 10 || a === 127 || a >= 224)
    return false
  if (a === 100 && b >= 64 && b <= 127)
    return false
  if (a === 169 && b === 254)
    return false
  if (a === 172 && b >= 16 && b <= 31)
    return false
  if (a === 192 && (b === 0 || b === 168))
    return false
  if (a === 198 && (b === 18 || b === 19))
    return false
  if (a === 192 && b === 0 && c === 2)
    return false
  if (a === 198 && b === 51 && c === 100)
    return false
  if (a === 203 && b === 0 && c === 113)
    return false

  return true
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('::ffff:'))
    return false
  if (normalized.startsWith('fc') || normalized.startsWith('fd'))
    return false
  if (/^fe[89ab]/.test(normalized) || normalized.startsWith('ff'))
    return false
  if (normalized.startsWith('2001:db8:'))
    return false

  const firstHextet = Number.parseInt(normalized.split(':')[0], 16)
  return firstHextet >= 0x2000 && firstHextet <= 0x3FFF
}

function isPublicIp(address: string): boolean {
  const version = isIP(address)
  if (version === 4)
    return isPublicIpv4(address)
  if (version === 6)
    return isPublicIpv6(address)
  return false
}

async function isPublicNetworkTarget(url: URL, lookupHost: typeof lookup): Promise<boolean> {
  if (url.protocol !== 'https:' || url.username || url.password)
    return false

  if (isIP(url.hostname))
    return isPublicIp(url.hostname)

  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost'))
    return false

  try {
    const addresses = await lookupHost(url.hostname, { all: true, verbatim: true })
    return addresses.length > 0 && addresses.every(entry => isPublicIp(entry.address))
  }
  catch {
    return false
  }
}

function hasExpectedMagic(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/png')
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
  if (mimeType === 'image/jpeg')
    return bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF
  if (mimeType === 'image/gif') {
    const signature = Buffer.from(bytes.subarray(0, 6)).toString('ascii')
    return signature === 'GIF87a' || signature === 'GIF89a'
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12
      && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF'
      && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  }
  return false
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
    return null
  if (!response.body)
    return null

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  }
  finally {
    reader.releaseLock()
  }

  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

export async function downloadTrustedImage(url: string, options: DownloadOptions): Promise<RemoteImage | null> {
  const fetchImpl = options.fetchImpl ?? fetch
  const lookupHost = options.lookupHost ?? lookup
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    let current = new URL(url)
    let redirected = false

    for (let redirects = 0; redirects <= maxRedirects; redirects++) {
      const trust = options.classifyUrl(current.toString())
      if (!redirected && trust === 'untrusted')
        return null
      if (trust !== 'configured-origin' && !await isPublicNetworkTarget(current, lookupHost))
        return null
      if (trust === 'configured-origin' && !['http:', 'https:'].includes(current.protocol))
        return null

      const response = await fetchImpl(current, {
        redirect: 'manual',
        signal: controller.signal,
      })

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location')
        if (!location || redirects === maxRedirects)
          return null
        current = new URL(location, current)
        redirected = true
        continue
      }

      if (!response.ok)
        return null

      const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!ALLOWED_IMAGE_TYPES.has(mimeType))
        return null

      const bytes = await readBoundedBody(response, maxBytes)
      if (!bytes || !hasExpectedMagic(bytes, mimeType))
        return null

      return {
        base64: Buffer.from(bytes).toString('base64'),
        mimeType,
      }
    }

    return null
  }
  catch {
    return null
  }
  finally {
    clearTimeout(timeout)
  }
}

export async function downloadTrustedImages(
  urls: string[],
  options: DownloadOptions,
): Promise<Array<RemoteImage | null>> {
  const limited = urls.slice(0, MAX_IMAGES)
  const results = Array.from({ length: limited.length }).fill(null) as Array<RemoteImage | null>
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, limited.length) }, async () => {
    while (nextIndex < limited.length) {
      const index = nextIndex++
      results[index] = await downloadTrustedImage(limited[index], options)
    }
  })

  await Promise.all(workers)
  return results
}
