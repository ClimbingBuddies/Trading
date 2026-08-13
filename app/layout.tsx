import './globals.css'
import './theme.css'
import type { Metadata } from 'next'
import AppNav from '@/components/AppNav'

export const metadata: Metadata = {
  title: 'Discover Boulders Markets',
  description: 'Market monitoring, assessments and strategy development dashboard',
}

const paletteBootScript = `
(function () {
  try {
    var key = 'discover-boulders-market-palette';
    var allowed = ['opportunity-blue', 'midnight-blue', 'original-green', 'aurora-slate'];
    var saved = window.localStorage.getItem(key);
    document.documentElement.dataset.theme = allowed.indexOf(saved) >= 0 ? saved : 'opportunity-blue';
  } catch (error) {
    document.documentElement.dataset.theme = 'opportunity-blue';
  }
})();
`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="opportunity-blue" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: paletteBootScript }} />
      </head>
      <body>
        <div className="appShell">
          <AppNav />
          <main className="mainContent">{children}</main>
        </div>
      </body>
    </html>
  )
}
