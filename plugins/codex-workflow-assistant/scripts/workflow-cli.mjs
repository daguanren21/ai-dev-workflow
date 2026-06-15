#!/usr/bin/env node
import { parseArgs, readConfig } from './lib/env.mjs'
import { createRequirementBranch } from './lib/git.mjs'

const USAGE = `Usage:
  workflow-cli.mjs branch --requirement <id> --base <master|main|dev>
  workflow-cli.mjs draft --date <today|YYYY-MM-DD> [--recent]
  workflow-cli.mjs note --task <id> --hours <hours> --kind <kind> --description <text>
  workflow-cli.mjs mark-submitted --draft-id <id> --manhour-key <key>
  workflow-cli.mjs status --date <today|YYYY-MM-DD>`

async function main(argv) {
  const { command, flags } = parseArgs(argv)
  const config = readConfig()

  if (command === 'config') {
    console.log(JSON.stringify(config.redacted, null, 2))
    return
  }

  if (command === 'help') {
    console.log(USAGE)
    return
  }

  if (command === 'branch') {
    if (!flags.requirement) {
      throw new Error('branch requires --requirement')
    }

    const result = await createRequirementBranch({
      requirement: flags.requirement,
      base: flags.base || config.defaultBaseBranch,
    })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  throw new Error(`Command not implemented yet: ${command}`)
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  console.error('')
  console.error(USAGE)
  process.exitCode = 1
})
