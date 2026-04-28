import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Xelera Method',
  description: 'Markdown-first planning, gating, scoring, and handoff before coding starts.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
