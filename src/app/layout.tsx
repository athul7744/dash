import type { Metadata, Viewport } from "next";
import { Inter, Lora, Fraunces, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { PowerSyncProvider } from "@/components/powersync-provider";
import { RouteRestorer } from "@/components/RouteRestorer";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const lora = Lora({ subsets: ["latin"], variable: "--font-serif" });
// Display/heading face — variable font; opsz axis + font-optical-sizing:auto
// lets larger titles pick up more display character automatically.
const fraunces = Fraunces({ subsets: ["latin"], axes: ["opsz"], variable: "--font-heading", display: "swap" });
// Monospace — fills the previously-dangling --font-geist-mono reference.
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Dash.",
  description: "An offline-first productivity dashboard",
  manifest: "/manifest.json",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dash.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4f46e5" },
    { media: "(prefers-color-scheme: dark)", color: "#6366f1" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${lora.variable} ${fraunces.variable} ${geistMono.variable} font-sans min-h-screen flex flex-col antialiased bg-background text-foreground`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PowerSyncProvider>
            <RouteRestorer />
            {/* App Shell Layout structure will be placed here or inside individual pages */}
            <div className="flex flex-col md:flex-row h-screen overflow-hidden">
              <main className="flex-1 overflow-y-auto relative">
                {children}
              </main>
            </div>
          </PowerSyncProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
