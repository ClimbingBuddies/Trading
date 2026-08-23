import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const repoRoot = process.cwd()
const componentRoot = join(repoRoot, 'components')
const guardedAppFiles = [
  'app/mobile-interaction.css',
  'app/opportunity-exposure-inspector.css',
  'app/opportunities/opportunity-daily-status.module.css',
]
const guardedExtensions = new Set(['.css', '.js', '.jsx', '.ts', '.tsx'])
const rawColourLiteral = /#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla)\s*\(/gi

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(path))
    else if (guardedExtensions.has(extname(entry.name))) files.push(path)
  }

  return files
}

const guardedFiles = [
  ...await collectFiles(componentRoot),
  ...guardedAppFiles.map((path) => join(repoRoot, path)),
]

const failures = []
for (const file of guardedFiles) {
  const source = await readFile(file, 'utf8')
  const matches = [...source.matchAll(rawColourLiteral)]
  if (!matches.length) continue

  failures.push({
    file: relative(repoRoot, file),
    literals: [...new Set(matches.map((match) => match[0]))],
  })
}

if (failures.length) {
  console.error('Palette compliance check failed. Shared/new component code must use semantic --theme-* or --chart-* tokens instead of raw colour literals.')
  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.literals.join(', ')}`)
  }
  process.exit(1)
}

console.log(`Palette compliance check passed for ${guardedFiles.length} component/style files.`)
