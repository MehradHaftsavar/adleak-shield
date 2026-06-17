import Script from 'next/script';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Script src="https://www.adleakshield.com/tracker.js" strategy="afterInteractive" />
    </>
  );
}
