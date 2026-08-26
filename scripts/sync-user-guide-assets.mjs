import { copyFile, mkdir, readFile, rm } from 'node:fs/promises'
import { basename, join, posix } from 'node:path'

const repoRoot = process.cwd()
const guidePath = join(repoRoot, 'documentation', 'user-guide.md')
const documentationRoot = join(repoRoot, 'documentation')
const destinationRoot = join(repoRoot, 'public', 'generated', 'user-guide')
const canonicalPrefix = 'images/user-guide/'

const markdown = await readFile(guidePath, 'utf8')
const imagePattern = /!\[[^\]]*\]\((images\/user-guide\/[^)\s]+)(?:\s+"[^"]*")?\)/g
const imageRefs = [...new Set([...markdown.matchAll(imagePattern)].map((match) => match[1]))]

if (!imageRefs.length) {
  throw new Error('No canonical user-guide screenshots were found to publish.')
}

await rm(destinationRoot, { recursive: true, force: true })
await mkdir(destinationRoot, { recursive: true })

for (const reference of imageRefs) {
  const normalized = posix.normalize(reference)
  if (!normalized.startsWith(canonicalPrefix) || normalized.includes('..')) {
    throw new Error(`Unsafe user-guide image path: ${reference}`)
  }

  const filename = basename(normalized)
  const source = join(documentationRoot, ...normalized.split('/'))
  const destination = join(destinationRoot, filename)
  await copyFile(source, destination)
}

console.log(`Published ${imageRefs.length} canonical user-guide screenshot assets.`)
