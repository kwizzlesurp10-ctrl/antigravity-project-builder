import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Antigravity Project Builder | Orbital Full-Stack Synthesizer',
  description: 'Visually assemble full-stack projects through weightless, orbital component animation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#05070f] text-slate-100">{children}</body>
    </html>
  );
}
