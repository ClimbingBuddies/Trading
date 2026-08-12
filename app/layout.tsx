import './globals.css'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Trading Admin',
  description: 'Trading data load monitoring dashboard',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="appShell">
          <aside className="sideNav">
            <div className="brand">Trading</div>
            <nav>
              <Link className="navActive" href="/admin">Admin</Link>
              <span className="navFuture">Markets</span>
              <span className="navFuture">Assessments</span>
              <span className="navFuture">Strategies</span>
            </nav>
          </aside>
          <main className="mainContent">{children}</main>
        </div>
      </body>
    </html>
  )
}
