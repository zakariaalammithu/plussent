import Link from "next/link";

const FEATURES = [
  {
    title: "Lead lists that stay clean",
    body: "Import, dedupe and verify leads in one place. Every lead keeps its source, tags and verification status, so you never email a stale address twice.",
  },
  {
    title: "Sequences that behave like a person",
    body: "Multi-step sequences with per-step delays, business-days-only sending and stop-on-reply. A/B variants let you test subject lines on real replies, not guesses.",
  },
  {
    title: "Warmup built in, not bolted on",
    body: "New sending accounts ramp up gradually with automated warmup sessions, daily limits and health scores — so your domain reputation survives week one.",
  },
  {
    title: "Deliverability you can actually see",
    body: "SPF, DKIM, DMARC and MX checks per domain, plus bounce and complaint tracking. Problems show up before your campaigns do.",
  },
  {
    title: "One inbox for every reply",
    body: "Replies from all connected accounts land in a single unified inbox, classified as interested, meeting request, question or not interested — so no hot lead waits.",
  },
  {
    title: "AI that drafts, you that decide",
    body: "Ask the AI assistant to draft a sequence, personalize an opener, or summarize a thread. Every draft is labelled with the provider that wrote it, and nothing sends without you.",
  },
];

const PLANS = [
  { name: "Free", price: "$0", per: "forever", blurb: "Try the core workflow.", features: ["100 leads", "1 email account", "1 active campaign", "Community support"], cta: "Start free", href: "/signup" },
  { name: "Starter", price: "$29", per: "/mo", blurb: "For a founder sending their first campaigns.", features: ["2,500 leads", "3 email accounts", "Unlimited campaigns", "Warmup included", "AI drafting (100 calls/day)"], cta: "Start Starter", href: "/signup" },
  { name: "Growth", price: "$79", per: "/mo", blurb: "For teams scaling outbound.", features: ["25,000 leads", "10 email accounts", "Unified inbox + AI classification", "Deliverability monitoring", "Priority support"], cta: "Start Growth", href: "/signup" },
  { name: "Agency", price: "$199", per: "/mo", blurb: "For agencies running client workspaces.", features: ["100,000 leads", "50 email accounts", "Unlimited workspaces", "Team roles & permissions", "White-label reports"], cta: "Start Agency", href: "/signup" },
  { name: "Enterprise", price: "Custom", per: "", blurb: "For high-volume, regulated sending.", features: ["Unlimited leads & accounts", "Dedicated IPs & onboarding", "SSO & audit logs", "Custom data retention", "Named success manager"], cta: "Talk to us", href: "/signup" },
];

const FAQS = [
  { q: "Do I need my own email accounts?", a: "Yes. PlusSent sends through accounts you connect — Gmail, Outlook or any SMTP provider. Your credentials are encrypted and never leave your workspace." },
  { q: "Will my emails land in spam?", a: "No tool can guarantee inbox placement. PlusSent gives you warmup, domain authentication checks, spam-word analysis and bounce handling so you can see and fix the things that cause spam placement." },
  { q: "Is there a free plan?", a: "Yes — the Free plan includes 100 leads, one email account and one active campaign, with no card required." },
  { q: "How does the AI assistant work?", a: "It drafts sequences, personalizes openers and classifies replies using the AI provider you configure in Settings (OpenAI, Anthropic or Muse). Without a configured provider it falls back to a clearly-labelled local heuristic — it never pretends to be an LLM." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel from Billing and your workspace stays on its current plan until the end of the paid period." },
];

export default function LandingPage() {
  return (
    <main>
      <section className="hero">
        <span className="badge badge-brand">Cold email, done properly</span>
        <h1>Cold email that lands in the inbox — and gets answered.</h1>
        <p className="lede">
          PlusSent brings leads, sequences, warmup, deliverability and one unified inbox into a single
          workspace, so your outbound stops being a pile of spreadsheets and starts being a pipeline.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" className="btn">Start free — no card required</Link>
          <Link href="/login" className="btn btn-secondary">Log in</Link>
        </div>
        <p className="small muted" style={{ marginTop: "1rem" }}>
          Free plan · 100 leads · 1 email account · Cancel anytime
        </p>
      </section>

      <section className="section" id="features">
        <h2>Everything outbound needs, in one place</h2>
        <p className="sub">No juggling five tools. PlusSent covers the whole loop — find, verify, send, warm up, reply, measure.</p>
        <div className="grid grid-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="card">
              <h3>{f.title}</h3>
              <p className="muted">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="integrations">
        <h2>Connects with the tools you already use</h2>
        <p className="sub">Gmail and Outlook OAuth, any SMTP/IMAP account, Stripe billing, Calendly, Zapier, Make and webhooks — plus AI from OpenAI, Anthropic or Muse when you add your own keys.</p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
          {["Gmail", "Outlook", "SMTP / IMAP", "Stripe", "OpenAI", "Anthropic", "Muse AI", "Calendly", "Zapier", "Make", "Webhooks", "MillionVerifier", "ZeroBounce", "Apollo"].map((n) => (
            <span key={n} className="badge">{n}</span>
          ))}
        </div>
        <p className="small muted" style={{ textAlign: "center", marginTop: "1rem" }}>
          Integrations show their real status in Settings → Integrations: configured, or awaiting credentials. Nothing is claimed to work before it is connected.
        </p>
      </section>

      <section className="section" id="pricing">
        <h2>Pricing that grows with your pipeline</h2>
        <p className="sub">Start free. Upgrade when your sending volume does. Every paid plan includes warmup, deliverability checks and the unified inbox.</p>
        <div className="pricing-grid">
          {PLANS.map((p) => (
            <article key={p.name} className="card" style={{ display: "flex", flexDirection: "column" }}>
              <h3>{p.name}</h3>
              <p className="price">{p.price} <span>{p.per}</span></p>
              <p className="muted small">{p.blurb}</p>
              <ul style={{ margin: "0 0 1rem", paddingLeft: "1.1rem", flex: 1 }}>
                {p.features.map((f) => (
                  <li key={f} className="small">{f}</li>
                ))}
              </ul>
              <Link href={p.href} className="btn">{p.cta}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="faq">
        <h2>Questions, answered honestly</h2>
        <div className="grid" style={{ maxWidth: 720, margin: "0 auto" }}>
          {FAQS.map((f) => (
            <article key={f.q} className="card">
              <h3>{f.q}</h3>
              <p className="muted" style={{ margin: 0 }}>{f.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" style={{ textAlign: "center" }}>
        <h2>Ready to send email people actually answer?</h2>
        <p className="sub">Create a free workspace, import your first leads, and launch a campaign today.</p>
        <Link href="/signup" className="btn">Create your free workspace</Link>
      </section>
    </main>
  );
}
