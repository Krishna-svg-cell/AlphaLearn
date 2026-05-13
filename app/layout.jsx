import './globals.css'
import AxiosSetup from './AxiosSetup'
import { ThemeProvider } from './providers'

export const metadata = {
  title: 'AlphaLearn – Smart EdTech Platform',
  description: 'Gamified EdTech Platform for Daily Learning Missions',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AlphaLearn',
  },
  formatDetection: { telephone: false },
}

export const viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white transition-colors duration-300" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AxiosSetup />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
