import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Forge — Build anything",
  description: "Paste a YouTube link or describe a project. AI finds every part, checks prices, and walks you through the build.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="shrink-0 border-b border-border-subtle bg-bg/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2.5 no-underline group">
              <span className="w-7 h-7 bg-accent rounded-md flex items-center justify-center text-xs font-bold text-white">
                F
              </span>
              <span className="font-semibold text-base tracking-tight text-text">Forge</span>
            </a>
            <nav className="flex items-center gap-4">
              <a href="/kits" className="text-xs text-text-muted hover:text-text no-underline uppercase tracking-wider font-medium">
                Kits
              </a>
              <span className="text-xs text-text-muted tracking-widest uppercase font-medium hidden sm:inline">
                Build anything.
              </span>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Forge browser extension: expose BOM data when available
              window.__forgeBOM = null;
              window.addEventListener('forge:bom', (e) => {
                window.__forgeBOM = e.detail;
                try { chrome?.storage?.local?.set({ forge_bom: e.detail }); } catch {}
              });
            `,
          }}
        />
      </body>
    </html>
  );
}
