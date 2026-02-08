import type { Metadata } from 'next';
import { IBM_Plex_Mono, Manrope, Space_Grotesk } from 'next/font/google';
import './globals.css';

const displayFont = Space_Grotesk({ subsets: ['latin'], variable: '--font-display' });
const bodyFont = Manrope({ subsets: ['latin'], variable: '--font-body' });
const monoFont = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'fluxsolutions',
  description: 'Secure file exchange with resumable uploads and share links',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} min-h-screen font-body text-brand-sand antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
