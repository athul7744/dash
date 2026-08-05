import type { Metadata, Viewport } from "next";
import { Inter, Lora, Fraunces, Hanken_Grotesk, Bricolage_Grotesque, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { PowerSyncProvider } from "@/components/powersync-provider";
import { CaptureProvider } from "@/components/capture/CaptureProvider";
import { CommandPaletteProvider } from "@/components/command/CommandPaletteProvider";
import { PreventZoom } from "@/components/PreventZoom";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const lora = Lora({ subsets: ["latin"], variable: "--font-serif" });
// Display/heading candidates — each exposes its own CSS var; the active one
// drives --font-heading via [data-display-font] (see globals.css + Settings).
// Fraunces is variable: opsz axis + font-optical-sizing:auto lets larger
// titles pick up more display character automatically.
const fraunces = Fraunces({ subsets: ["latin"], axes: ["opsz"], variable: "--font-fraunces", display: "swap" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
// Monospace — fills the previously-dangling --font-geist-mono reference.
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

// Applied before paint so the chosen display font has no flash of the default.
// Targets <body> (where the --font-* vars live); the inline script is body's
// first child, so document.body already exists when it runs.
const DISPLAY_FONT_INIT = `try{var f=localStorage.getItem("display-font");if(f&&f!=="fraunces")document.body.setAttribute("data-display-font",f)}catch(e){}`;

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
      <body
        suppressHydrationWarning
        spellCheck={false}
        className={`${inter.variable} ${lora.variable} ${fraunces.variable} ${hanken.variable} ${bricolage.variable} ${geistMono.variable} font-sans min-h-screen flex flex-col antialiased bg-background text-foreground`}
      >
        <script dangerouslySetInnerHTML={{ __html: DISPLAY_FONT_INIT }} />
        <PreventZoom />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PowerSyncProvider>
            <CaptureProvider>
              <CommandPaletteProvider>
                {/* App Shell Layout structure will be placed here or inside individual pages */}
                <div className="flex flex-col md:flex-row h-screen overflow-hidden">
                  <main className="flex-1 overflow-y-auto relative">
                    {children}
                  </main>
                </div>
              </CommandPaletteProvider>
            </CaptureProvider>
          </PowerSyncProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
