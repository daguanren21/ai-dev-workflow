import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig, findConfigFile, resolveAuthEnv } from '../../src/config/loader.js'

describe('Config Loader', () => {
  const testDir = join(tmpdir(), 'mcp-config-test-' + Date.now())
  const subDir = join(testDir, 'sub', 'deep')

  beforeEach(() => {
    mkdirSync(subDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('findConfigFile', () => {
    it('should find config in current directory', () => {
      writeFileSync(join(testDir, '.requirements-mcp.json'), '{}')

      const result = findConfigFile(testDir)

      expect(result).toBe(join(testDir, '.requirements-mcp.json'))
    })

    it('should find config in parent directory', () => {
      writeFileSync(join(testDir, '.requirements-mcp.json'), '{}')

      const result = findConfigFile(subDir)

      expect(result).toBe(join(testDir, '.requirements-mcp.json'))
    })

    it('should return null if not found', () => {
      const result = findConfigFile(subDir)

      expect(result).toBeNull()
    })
  })

  describe('resolveAuthEnv', () => {
    beforeEach(() => {
      vi.stubEnv('TEST_TOKEN', 'my-secret-token')
      vi.stubEnv('TEST_USER', 'admin')
      vi.stubEnv('TEST_PASS', 'password123')
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('should resolve token auth env vars', () => {
      const result = resolveAuthEnv({ type: 'token', tokenEnv: 'TEST_TOKEN' })

      expect(result.token).toBe('my-secret-token')
    })

    it('should resolve basic auth env vars', () => {
      const result = resolveAuthEnv({
        type: 'basic',
        usernameEnv: 'TEST_USER',
        passwordEnv: 'TEST_PASS',
      })

      expect(result.username).toBe('admin')
      expect(result.password).toBe('password123')
    })

    it('should throw for missing env vars', () => {
      expect(() =>
        resolveAuthEnv({ type: 'token', tokenEnv: 'NONEXISTENT_VAR' }),
      ).toThrow('NONEXISTENT_VAR')
    })
  })

  describe('loadConfig', () => {
    beforeEach(() => {
      vi.stubEnv('TEST_TOKEN', 'my-token')
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('should load and validate a valid config', () => {
      const config = {
        sources: {
          jira: {
            enabled: true,
            apiBase: 'https://jira.example.com',
            auth: { type: 'token', tokenEnv: 'TEST_TOKEN' },
          },
        },
        defaultSource: 'jira',
      }
      writeFileSync(join(testDir, '.requirements-mcp.json'), JSON.stringify(config))

      const result = loadConfig(testDir)

      expect(result.sources).toHaveLength(1)
      expect(result.sources[0].type).toBe('jira')
      expect(result.sources[0].resolvedAuth.token).toBe('my-token')
      expect(result.config.defaultSource).toBe('jira')
    })

    it('should skip disabled sources', () => {
      const config = {
        sources: {
          jira: {
            enabled: false,
            apiBase: 'https://jira.example.com',
            auth: { type: 'token', tokenEnv: 'TEST_TOKEN' },
          },
          github: {
            enabled: true,
            apiBase: 'https://api.github.com',
            auth: { type: 'token', tokenEnv: 'TEST_TOKEN' },
          },
        },
      }
      writeFileSync(join(testDir, '.requirements-mcp.json'), JSON.stringify(config))

      const result = loadConfig(testDir)

      expect(result.sources).toHaveLength(1)
      expect(result.sources[0].type).toBe('github')
    })

    it('should throw if no config file found', () => {
      expect(() => loadConfig(subDir)).toThrow('not found')
    })

    it('should throw if JSON is invalid', () => {
      writeFileSync(join(testDir, '.requirements-mcp.json'), '{invalid}')

      expect(() => loadConfig(testDir)).toThrow('Invalid JSON')
    })

    it('should throw if schema validation fails', () => {
      writeFileSync(join(testDir, '.requirements-mcp.json'), JSON.stringify({
        sources: {
          jira: {
            enabled: true,
            apiBase: 'not-a-url',
            auth: { type: 'token' },
          },
        },
      }))

      expect(() => loadConfig(testDir)).toThrow('Invalid config')
    })

    it('should throw if all sources are disabled', () => {
      const config = {
        sources: {
          jira: {
            enabled: false,
            apiBase: 'https://jira.example.com',
            auth: { type: 'token', tokenEnv: 'TEST_TOKEN' },
          },
        },
      }
      writeFileSync(join(testDir, '.requirements-mcp.json'), JSON.stringify(config))

      expect(() => loadConfig(testDir)).toThrow('No enabled sources')
    })
  })
})
