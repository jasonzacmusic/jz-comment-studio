import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JZ Comment Studio',
  description: 'Reply to YouTube comments at scale',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
