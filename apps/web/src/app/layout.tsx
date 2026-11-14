import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { ServiceWorkerRegistration } from '../components/ServiceWorkerRegistration';
import { SPLASH_SCRIPT } from '../components/splash/splash-script';
import { WelcomeSplash } from '../components/splash/WelcomeSplash';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: t('title'),
    description: t('description'),
    applicationName: 'BricoMission',
    appleWebApp: { capable: true, title: 'BricoMission', statusBarStyle: 'default' },
    icons: {
      icon: [
        { url: '/icons/favicon.svg', type: 'image/svg+xml' },
        { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      ],
      apple: '/icons/apple-touch-icon.png',
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2968EC',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    // suppressHydrationWarning: the inline splash script sets data-splash on <html> before
    // hydration (feature brand-logo-animation); nothing else on <html> differs.
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
      </head>
      <body>
        <WelcomeSplash />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
