import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Patient Journey | 病人就醫歷程智慧平台',
  description: 'Next.js + BFF + SMART on FHIR (TW Core) POC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
