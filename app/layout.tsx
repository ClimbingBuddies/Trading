import './globals.css'
import type { Metadata } from 'next'
import AppNav from '@/components/AppNav'

export const metadata: Metadata = {
  title: 'Discover Boulders Markets',
  description: 'Market monitoring, assessments and strategy development dashboard',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="appShell">
          <AppNav />
          <main className="mainContent">{children}</main>
        </div>
      </body>
    </html>
  )
}
