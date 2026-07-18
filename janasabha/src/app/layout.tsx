import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JanaSabha — Public Petition Platform',
  description: 'Submit petitions to your elected representatives in Malayalam or English',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
