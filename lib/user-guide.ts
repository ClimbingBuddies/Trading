import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

export const USER_GUIDE_REPOSITORY_PATH = 'documentation/user-guide.md'
const USER_GUIDE_DIRECTORY = 'documentation'
const GITHUB_BLOB_BASE = 'https://github.com/ClimbingBuddies/Trading/blob/main'
const GENERATED_IMAGE_PREFIX = '/generated/user-guide/'
const CANONICAL_IMAGE_PREFIX = 'images/user-guide/'

export function loadUserGuideMarkdown(): string {
  return readFileSync(join(process.cwd(), USER_GUIDE_REPOSITORY_PATH), 'utf8')
}

export function resolveGuideHref(href?: string): string {
  if (!href) return '#'
  if (href.startsWith('#') || href.startsWith('/')) return href
  if (/^(?:https?:\/\/|mailto:|tel:)/i.test(href)) return href

  const hashIndex = href.indexOf('#')
  const relativePath = hashIndex >= 0 ? href.slice(0, hashIndex) : href
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : ''
  const repositoryPath = posix.normalize(posix.join(USER_GUIDE_DIRECTORY, relativePath))

  if (repositoryPath === '..' || repositoryPath.startsWith('../')) return '#'

  return `${GITHUB_BLOB_BASE}/${repositoryPath}${hash}`
}

export function resolveGuideImageSrc(src?: string): string {
  if (!src) return ''
  if (src.startsWith('/') || /^(?:https?:\/\/|data:)/i.test(src)) return src
  if (!src.startsWith(CANONICAL_IMAGE_PREFIX)) return src

  const filename = src.slice(CANONICAL_IMAGE_PREFIX.length)
  if (!filename || filename.includes('/') || filename.includes('..')) return ''

  return `${GENERATED_IMAGE_PREFIX}${filename}`
}
