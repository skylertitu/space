import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Outfit } from "next/font/google";

import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/SidebarContext";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { GmailAutoConnect } from "@/components/integrations/GmailAutoConnect";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Roosevelt Super Intelligence",
  description: `A Next-Generation Super Intelligence (SI) infrastructure designed to act as a unified command center. It's a proactive manager integrating business strategy with personal optimization.

How it works:
• Total Interconnectivity: Links digital assets, blockchains (like Solana), and admin tools for a real-time 360° view.
• Predictive Analysis: Detects patterns, financial risks, and crypto opportunities before they become problems.
• Autonomous Execution: Resolves technical tasks independently, letting you focus on high-level decisions.

Impact Areas: Web3 Ecosystems, Business Direction, and Time Optimization.

It is the bridge between the founder's vision and operational execution, evolving with your business.`,
  icons: {
    icon: [
      { url: "/assets/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/assets/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/assets/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/assets/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/assets/icon-192.png", sizes: "180x180", type: "image/png" },
    shortcut: "/favicon.ico",
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap" rel="stylesheet" />
      </head>
      <body className={`${outfit.variable} ${outfit.className} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            <AuthProvider>
              <SidebarProvider>
                <GmailAutoConnect />
                {children}
                <Toaster position="top-right" richColors theme="dark" />
              </SidebarProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
        <Script src="https://terminal.jup.ag/main-v3.js" strategy="lazyOnload" />
        <Script id="meta-sdk-core" strategy="lazyOnload">
          {`
            window.fbAsyncInit = function() {
              const appId = '${process.env.NEXT_PUBLIC_META_APP_ID}';
              
              if (!appId || appId === 'undefined') {
                console.warn('🚀 [ROOSEVELT META SDK]: NEXT_PUBLIC_META_APP_ID no configurado.');
                return;
              }

              FB.init({
                appId: appId,
                cookie: true,
                xfbml: true,
                version: 'v21.0'
              });
              
              // Meta (Facebook) obliga estrictamente a usar HTTPS para getLoginStatus
              // Localhost ya no es suficiente sin SSL
              const isHttps = window.location.protocol === 'https:';
              
              if (isHttps && typeof FB !== 'undefined' && FB.getLoginStatus) {
                try {
                  FB.getLoginStatus(function() {
                    window.FB_READY = true;
                    console.log('🚀 [ROOSEVELT META SDK]: Inicializado.');
                  });
                } catch (e) {
                  window.FB_READY = true;
                }
              } else {
                window.FB_READY = true;
                console.log('🚀 [ROOSEVELT META SDK]: Inicializado en modo HTTP (Funciones de sesión limitadas).');
              }
            };
            (function(d, s, id) {
              var js, fjs = d.getElementsByTagName(s)[0];
              if (d.getElementById(id)) return;
              js = d.createElement(s); js.id = id;
              js.src = "https://connect.facebook.net/en_US/sdk.js";
              fjs.parentNode.insertBefore(js, fjs);
            }(document, 'script', 'facebook-jssdk'));
          `}
        </Script>
      </body>
    </html>
  );
}
