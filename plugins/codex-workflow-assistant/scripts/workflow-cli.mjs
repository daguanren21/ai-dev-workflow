#!/usr/bin/env node
import { parseArgs, readConfig } from './lib/env.mjs'

const USAGE = `Usage:
  workflow-cli.mjs branch --requirement <id> --base <master|main|dev>
  workflow-cli.mjs draft --date <today|YYYY-MM-DD> [--recent]
  workflow-cli.mjs note --task <id> --hours <hours> --kind <kind> --description <text>
  workflow-cli.mjs mark-submitted --draft-id <id> --manhour-key <key>
  workflow-cli.mjs status --date <today|YYYY-MM-DD>`

async function main(argv) {
  const { command } = parseArgs(argv)
  const config = readConfig()

  if (command === 'config') {
    console.log(JSON.stringify(config.redacted, null, 2))
    return
  }

  if (command === 'help') {
    console.log(USAGE)
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
