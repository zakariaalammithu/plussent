import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "./_components/ThemeToggle";

export const metadata: Metadata = {
  title: "PlaseSent — Cold email that lands in the inbox",
  description:
    "PlaseSent is a cold email platform with lead management, multi-step sequences, warmup, deliverability checks, a unified inbox and AI-assisted writing.",
};

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('plasesent-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <header className="topnav">
          <Link href="/" className="logo">
            Plase<span>Sent</span>
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
          <p>
            PlaseSent — cold email that lands in the inbox.{" "}
            <Link href="/marketing.html">Original marketing page</Link> · <Link href="/login">Log in</Link> ·{" "}
            <Link href="/signup">Sign up</Link>
          </p>
          <p className="small">Sending, deliverability and AI features require your own connected accounts and API keys — see Settings → Integrations.</p>
        </footer>
      </body>
    </html>
  );
}
