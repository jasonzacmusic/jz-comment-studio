import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'JZ Comment Studio', description: 'Reply to YouTube comments at scale' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body style={{margin:0,padding:0,background:'#0c0c0e',color:'#e4e4ec',fontFamily:'monospace'}}>{children}</body></html>;
}
