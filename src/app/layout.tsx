import type { Metadata } from 'next';
import { Outfit, DM_Sans } from 'next/font/google';
import { AuthProvider } from '@/components/auth/AuthProvider';
import ThemeProvider from '@/components/app/ThemeProvider';
import './globals.css';

const display = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
  display: 'swap',
});

const body = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TradePinax — Evidence. Discipline. Edge.',
  description:
    'Journal, live terminal, NSE & BSE scanner, automation, and AI agents — one professional platform for Indian traders.',
  icons: {
    icon: '/tradepinax-mark.png',
    apple: '/tradepinax-mark.png',
  },
};

/** Avoid light flash before React hydrates — mirrors theme-prefs key. */
const themeInitScript = `(function(){try{var t=localStorage.getItem('trademindpro_theme_v1');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}else{document.documentElement.style.colorScheme='light';}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-body antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
