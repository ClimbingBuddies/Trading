import ReactMarkdown from 'react-markdown'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import type { Metadata } from 'next'

import {
  loadUserGuideMarkdown,
  resolveGuideHref,
  resolveGuideImageSrc,
  USER_GUIDE_REPOSITORY_PATH,
} from '@/lib/user-guide'
import styles from './help.module.css'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Help | Discover Boulders Markets',
  description: 'Canonical Discover Boulders Markets user guide.',
}

export default function HelpPage() {
  const markdown = loadUserGuideMarkdown()

  return (
    <div className={styles.helpPage}>
      <article className={styles.article} data-guide-source={USER_GUIDE_REPOSITORY_PATH}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug]}
          skipHtml
          components={{
            a({ node: _node, href, children, ...props }) {
              const resolvedHref = resolveGuideHref(href)
              const external = /^https?:\/\//i.test(resolvedHref)

              return (
                <a
                  {...props}
                  href={resolvedHref}
                  {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                >
                  {children}
                </a>
              )
            },
            img({ node: _node, src, alt, ...props }) {
              return (
                <img
                  {...props}
                  src={resolveGuideImageSrc(typeof src === 'string' ? src : '')}
                  alt={alt ?? ''}
                  loading="lazy"
                />
              )
            },
            table({ node: _node, children, ...props }) {
              return (
                <div className={styles.tableScroll} role="region" aria-label="Scrollable user-guide table" tabIndex={0}>
                  <table {...props}>{children}</table>
                </div>
              )
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  )
}
