import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { Layout } from '@/shared/components/Layout';
import { Providers } from '@/shared/components/Providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'CarbonBox — CSV processing',
  description: 'Upload activity CSV files and follow their asynchronous processing',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Layout>{children}</Layout>
        </Providers>
      </body>
    </html>
  );
}
