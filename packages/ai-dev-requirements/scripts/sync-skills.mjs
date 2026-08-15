import { cpSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const repositorySkills = fileURLToPath(new URL('../../../skills', import.meta.url))
const packageSkills = fileURLToPath(new URL('../skills', import.meta.url))

rmSync(packageSkills, { recursive: true, force: true })
cpSync(repositorySkills, packageSkills, { recursive: true })
cpSync(fileURLToPath(new URL('../../../README.md', import.meta.url)), fileURLToPath(new URL('../README.md', import.meta.url)))
cpSync(fileURLToPath(new URL('../../../README.zh-CN.md', import.meta.url)), fileURLToPath(new URL('../README.zh-CN.md', import.meta.url)))
cpSync(fileURLToPath(new URL('../../../LICENSE', import.meta.url)), fileURLToPath(new URL('../LICENSE', import.meta.url)))

console.error(`Copied package assets into ${packageRoot}`)
