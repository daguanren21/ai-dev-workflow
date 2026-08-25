import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parse } from 'dotenv'

export function loadNearestEnv(startDir = process.cwd(), environment: NodeJS.ProcessEnv = process.env): string | null {
  let current = resolve(startDir)
  while (true) {
    const envPath = resolve(current, '.env')
    if (existsSync(envPath)) {
      const values = parse(readFileSync(envPath))
      for (const [key, value] of Object.entries(values))
        environment[key] ??= value
      return envPath
    }
    const parent = dirname(current)
    if (parent === current)
      return null
    current = parent
  }
}
