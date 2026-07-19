import type { Metadata } from 'next';
import { Outfit, DM_Sans } from 'next/font/google';
import { AuthProvider } from '@/components/auth/AuthProvider';
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
  title: 'TradeMind Pro — AI Trading Operating System',
  description:
    'Journal, live terminal, NSE & BSE scanner, automation, and AI agents — one professional platform for Indian traders.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
