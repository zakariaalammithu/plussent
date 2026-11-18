export default function HelpPage() {
  return (<main style={{ padding: 24 }}>
    <h1>Help &amp; Support</h1>
    <h2>Getting started</h2>
    <ol>
      <li>Sign up and verify your email (verification email requires SMTP to be configured in Settings → Integrations).</li>
      <li>Connect an email account (Email Accounts) and configure your sending domain (Deliverability).</li>
      <li>Import leads (Leads → Import CSV) and create your first campaign (Campaigns).</li>
      <li>Launch only after the required checks pass — the sending worker respects daily limits and stop-on-reply rules.</li>
    </ol>
    <h2>What needs credentials</h2>
    <p>SMTP sending, Gmail/Outlook OAuth, Stripe billing, and live AI providers (OpenAI/Anthropic/Muse) each need keys configured in Settings → Integrations. Until then the app reports them as awaiting credentials and does not pretend they work.</p>
    <h2>Docs</h2>
    <p>See <code>ARCHITECTURE.md</code> and <code>README.md</code> in the repository for architecture, setup, and deployment.</p>
  </main>);
}
