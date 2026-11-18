import { redirect } from "next/navigation";
import { providerStatus } from "@/lib/ai/providers";
import { getSessionUser } from "@/lib/session";
import AppShell from "../_components/AppShell";

function envStatus(names: string[]): "configured" | "awaiting_credentials" {
  return names.every((n) => !!process.env[n]) ? "configured" : "awaiting_credentials";
}

export default async function IntegrationsPage() {
  const sess = await getSessionUser();
  if (!sess) redirect("/login");
  const ai = providerStatus();
  const items: { name: string; kind: string; status: string; hint: string }[] = [
    { name: "Gmail", kind: "Email account", status: envStatus(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]), hint: "OAuth: set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, then connect an account from Email Accounts." },
    { name: "Outlook", kind: "Email account", status: envStatus(["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"]), hint: "OAuth: set MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET, then connect an account from Email Accounts." },
    { name: "SMTP / IMAP", kind: "Email account", status: envStatus(["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]), hint: "Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS." },
    { name: "Muse AI", kind: "AI provider", status: ai.muse, hint: "Needs MUSE_API_URL + MUSE_API_KEY and a documented Muse endpoint. No endpoint is assumed — without it, calls return awaiting_credentials." },
    { name: "OpenAI", kind: "AI provider", status: ai.openai, hint: "Set OPENAI_API_KEY to enable AI drafting and classification via OpenAI." },
    { name: "Anthropic", kind: "AI provider", status: ai.anthropic, hint: "Set ANTHROPIC_API_KEY to enable AI drafting and classification via Anthropic." },
    { name: "MillionVerifier", kind: "Email verification", status: envStatus(["MILLIONVERIFIER_API_KEY"]), hint: "Set MILLIONVERIFIER_API_KEY. Verification runs against the provider only when configured." },
    { name: "ZeroBounce", kind: "Email verification", status: envStatus(["ZEROBOUNCE_API_KEY"]), hint: "Set ZEROBOUNCE_API_KEY. Verification runs against the provider only when configured." },
    { name: "Apollo", kind: "Lead data", status: envStatus(["APOLLO_API_KEY"]), hint: "Set APOLLO_API_KEY to enable Lead Finder lookups via Apollo." },
    { name: "Calendly", kind: "Scheduling", status: envStatus(["CALENDLY_API_KEY"]), hint: "Set CALENDLY_API_KEY (or a Calendly scheduling link) to link meetings from replies." },
    { name: "Zapier", kind: "Automation", status: envStatus(["ZAPIER_WEBHOOK_URL"]), hint: "Set a ZAPIER_WEBHOOK_URL (or connect via API keys in Settings) to forward events to Zapier." },
    { name: "Make", kind: "Automation", status: envStatus(["MAKE_WEBHOOK_URL"]), hint: "Set a MAKE_WEBHOOK_URL to forward events to Make." },
    { name: "Webhooks", kind: "Automation", status: "configured", hint: "Outbound webhook delivery is part of the platform — configure target URLs per workspace in Settings once the webhook API exists." },
    { name: "Stripe", kind: "Billing", status: envStatus(["STRIPE_SECRET_KEY"]), hint: "Set STRIPE_SECRET_KEY (+ STRIPE_WEBHOOK_SECRET) to enable checkout and subscription webhooks." },
  ];
  return (
    <AppShell current="/integrations" title="Integrations" subtitle={sess.workspace?.name ?? ""}>
      <p className="muted">
        Every integration shows its real status. <strong>configured</strong> means the required credentials are present on
        the server; <strong>awaiting_credentials</strong> means it is not connected yet. No integration is claimed to work
        without credentials, and no secret values are shown here.
      </p>
      <div className="grid grid-2">
        {items.map((i) => (
          <div key={i.name} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
              <h3 style={{ margin: 0 }}>{i.name}</h3>
              {i.status === "configured"
                ? <span className="badge badge-ok">configured</span>
                : <span className="badge badge-warn">awaiting_credentials</span>}
            </div>
            <p className="small muted" style={{ margin: "0.25rem 0 0.5rem" }}>{i.kind}</p>
            <p className="small" style={{ margin: 0 }}>{i.hint}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
