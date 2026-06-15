import { spawn } from 'node:child_process'

const ALLOWED_BASE_BRANCHES = ['master', 'main', 'dev']

export function assertAllowedBaseBranch(base) {
  if (!ALLOWED_BASE_BRANCHES.includes(base)) {
    throw new Error(`Invalid base branch "${base}". Allowed base branches: master, main, dev`)
  }
}

export function sanitizeBranchPart(value) {
  const text = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

  return text.slice(0, 64) || 'work'
}

export async function createRequirementBranch({ requirement, base, title = '', run = runCommand }) {
  assertAllowedBaseBranch(base)

  const status = await run('git', ['status', '--porcelain'])
  if (status.trim()) {
    throw new Error('Worktree is dirty. Commit, stash, or clean local changes before creating a requirement branch.')
  }

  const branch = `req/${sanitizeBranchPart(`${requirement} ${title}`)}`
  await run('git', ['fetch', 'origin', base])
  await run('git', ['checkout', base])
  await run('git', ['pull', '--ff-only', 'origin', base])
  await run('git', ['checkout', '-b', branch])

  return { branch, base, requirement }
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
      }
      else {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code}: ${stderr.trim()}`))
      }
    })
  })
}
