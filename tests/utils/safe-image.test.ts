import type { RemoteImageTrust } from '../../src/utils/safe-image'
import { describe, expect, it, vi } from 'vitest'
import { downloadTrustedImage, downloadTrustedImages } from '../../src/utils/safe-image'

const PNG_BYTES = new Uint8Array([
  0x89,
  0x50,
  0x4E,
  0x47,
  0x0D,
  0x0A,
  0x1A,
  0x0A,
  0x00,
  0x00,
  0x00,
  0x00,
])

function configuredOnly(url: string): RemoteImageTrust {
  return new URL(url).origin === 'https://ones.test'
    ? 'configured-origin'
    : 'untrusted'
}

function pngResponse(init?: ResponseInit): Response {
  return new Response(PNG_BYTES, {
    status: 200,
    headers: { 'content-type': 'image/png' },
    ...init,
  })
}

describe('downloadTrustedImage', () => {
  it('rejects an untrusted initial URL without making a request', async () => {
    const fetchImpl = vi.fn()

    const result = await downloadTrustedImage('https://attacker.test/pixel.png', {
      classifyUrl: configuredOnly,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a source-issued private network URL', async () => {
    const fetchImpl = vi.fn()

    const result = await downloadTrustedImage('https://127.0.0.1/internal.png', {
      classifyUrl: () => 'source-issued',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    'https://[::1]/internal.png',
    'https://[::ffff:8.8.8.8]/mapped.png',
    'https://[2001:db8::1]/documentation.png',
  ])('rejects non-public IPv6 targets before making a request: %s', async (url) => {
    const fetchImpl = vi.fn()

    await expect(downloadTrustedImage(url, {
      classifyUrl: () => 'source-issued',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).resolves.toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('allows a source-issued public IPv6 target', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pngResponse())

    await expect(downloadTrustedImage('https://[2001:4860:4860::8888]/image.png', {
      classifyUrl: () => 'source-issued',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).resolves.toEqual({
      base64: Buffer.from(PNG_BYTES).toString('base64'),
      mimeType: 'image/png',
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('revalidates redirects and blocks a redirect to private infrastructure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'https://169.254.169.254/latest/meta-data' },
    }))

    const result = await downloadTrustedImage('https://ones.test/image.png', {
      classifyUrl: configuredOnly,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result).toBeNull()
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('rejects oversized and non-image responses', async () => {
    const oversizedFetch = vi.fn().mockResolvedValue(new Response(PNG_BYTES, {
      status: 200,
      headers: {
        'content-length': String(9 * 1024 * 1024),
        'content-type': 'image/png',
      },
    }))
    const htmlFetch = vi.fn().mockResolvedValue(new Response('<script>alert(1)</script>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }))

    await expect(downloadTrustedImage('https://ones.test/large.png', {
      classifyUrl: configuredOnly,
      fetchImpl: oversizedFetch as unknown as typeof fetch,
    })).resolves.toBeNull()
    await expect(downloadTrustedImage('https://ones.test/not-image.png', {
      classifyUrl: configuredOnly,
      fetchImpl: htmlFetch as unknown as typeof fetch,
    })).resolves.toBeNull()
  })

  it('returns a valid bounded image', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pngResponse())

    const result = await downloadTrustedImage('https://ones.test/image.png', {
      classifyUrl: configuredOnly,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result).toEqual({
      base64: Buffer.from(PNG_BYTES).toString('base64'),
      mimeType: 'image/png',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://ones.test/image.png'),
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it('caps the number of image requests per tool call', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(pngResponse()))
    const urls = Array.from({ length: 12 }, (_, index) => `https://ones.test/${index}.png`)

    const results = await downloadTrustedImages(urls, {
      classifyUrl: configuredOnly,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(results).toHaveLength(8)
    expect(fetchImpl).toHaveBeenCalledTimes(8)
  })
})
