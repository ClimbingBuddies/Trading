import './globals.css'
import './theme.css'
import './theme-v2.css'
import './theme-light.css'
import './theme-compliance.css'
import './opportunity-carousel-responsive.css'
import type { Metadata } from 'next'
import AppNav from '@/components/AppNav'
import ThemePaletteSelector from '@/components/ThemePaletteSelector'

export const metadata: Metadata = {
  title: 'Discover Boulders Markets',
  description: 'Market monitoring, assessments and strategy development dashboard',
}

const paletteBootScript = `
(function () {
  try {
    var key = 'discover-boulders-market-palette';
    var allowed = ['midnight-blue', 'original-green', 'copper-ember', 'plum-night', 'stone-paper'];
    var saved = window.localStorage.getItem(key);
    if (saved === 'alpine-light') saved = 'stone-paper';
    var resolved = allowed.indexOf(saved) >= 0 ? saved : 'midnight-blue';
    document.documentElement.dataset.theme = resolved;
    if (window.localStorage.getItem(key) !== resolved) window.localStorage.setItem(key, resolved);
  } catch (error) {
    document.documentElement.dataset.theme = 'midnight-blue';
  }
})();
`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="midnight-blue" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: paletteBootScript }} />
      </head>
      <body>
        <div className="appShell">
          <AppNav />
          <div className="contentShell">
            <div className="globalTopBar">
              <div className="globalPaletteDock">
                <ThemePaletteSelector />
              </div>
            </div>
            <main className="mainContent">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}
