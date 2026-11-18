import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "./_components/ThemeToggle";
import BrandLogo from "./_components/BrandLogo";

export const metadata: Metadata = {
  metadataBase: new URL("https://plussent.com"),
  applicationName: "PlusSent",
  title: "PlusSent — Cold email that lands in the inbox",
  description:
    "PlusSent is a cold email platform with lead management, multi-step sequences, warmup, deliverability checks, a unified inbox and AI-assisted writing.",
  keywords: ["PlusSent", "cold email", "email outreach", "sales engagement", "deliverability"],
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.png", type: "image/png" },
      { url: "/brand/plussent-icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    url: "https://plussent.com",
    siteName: "PlusSent",
    title: "PlusSent — Cold email that lands in the inbox",
    description:
      "PlusSent is a cold email platform with lead management, multi-step sequences, warmup, deliverability checks, a unified inbox and AI-assisted writing.",
    images: [{ url: "/brand/plussent-logo.png", width: 2172, height: 724, alt: "PlusSent" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PlusSent — Cold email that lands in the inbox",
    description:
      "PlusSent is a cold email platform with lead management, multi-step sequences, warmup, deliverability checks, a unified inbox and AI-assisted writing.",
    images: ["/brand/plussent-logo.png"],
  },
};

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('plussent-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <header className="topnav">
          <Link href="/" aria-label="PlusSent — home" style={{ display: "inline-flex", lineHeight: 0 }}>
            <BrandLogo variant="full" height={32} priority />
          </Link>
          <nav>
            <Link href="/#features">Features</Link>
            <Link href="/#pricing">Pricing</Link>
            <Link href="/#faq">FAQ</Link>
            <Link href="/login">Log in</Link>
            <ThemeToggle />
            <Link href="/signup" className="btn">
              Start free
            </Link>
          </nav>
        </header>
        {children}
        <footer className="footer">
          <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <BrandLogo variant="icon" height={22} />
            PlusSent — cold email that lands in the inbox.{" "}
            <Link href="/marketing.html">Original marketing page</Link> · <Link href="/login">Log in</Link> ·{" "}
            <Link href="/signup">Sign up</Link>
          </p>
          <p className="small">© {new Date().getFullYear()} PlusSent · plussent.com</p>
          <p className="small">Sending, deliverability and AI features require your own connected accounts and API keys — see Settings → Integrations.</p>
        </footer>
      </body>
    </html>
  );
}
