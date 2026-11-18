import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import AppShell from "../_components/AppShell";
import BillingPlans from "./BillingPlans";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const sess = await getSessionUser();
  if (!sess) redirect("/login");
  const params = await searchParams;
  const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
  let sub: { plan: string; status: string; currentPeriodEnd: number | null } | null = null;
  let dbReady = false;
  if (sess.workspace) {
    try {
      const rows = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, sess.workspace.id)).limit(1);
      sub = rows[0] ? { plan: rows[0].plan, status: rows[0].status, currentPeriodEnd: rows[0].currentPeriodEnd } : null;
      dbReady = true;
    } catch { /* db not initialised */ }
  }
  const currentPlan = sub?.plan ?? sess.workspace?.plan ?? "free";

  return (
    <AppShell current="/billing" title="Billing" subtitle={sess.workspace?.name ?? ""}>
      {params.checkout === "success" && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <strong className="ok-text">Checkout completed.</strong>
          <p className="muted" style={{ margin: "0.5rem 0 0" }}>Your plan updates once Stripe confirms the payment via webhook — never from this page alone. Refresh in a moment to see the new plan.</p>
        </div>
      )}
      {params.checkout === "cancelled" && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <strong>Checkout cancelled.</strong>
          <p className="muted" style={{ margin: "0.5rem 0 0" }}>No charge was made. Pick a plan below whenever you are ready.</p>
        </div>
      )}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3>Current plan</h3>
        <p><strong>{currentPlan}</strong> {sub && <>· status: <span className="badge">{sub.status}</span></>}
          {sub?.currentPeriodEnd && <> · renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}</>}
        </p>
        {!dbReady && <p className="muted small">Subscription record unavailable — database not initialised yet. The plan shown comes from the workspace record.</p>}
        <p className="muted small">
          Stripe billing: {stripeConfigured ? <span className="badge badge-ok">configured</span> : <span className="badge badge-warn">awaiting_credentials</span>}
          {!stripeConfigured && " — set STRIPE_SECRET_KEY (and STRIPE_PRICE_* for each plan) to enable checkout."}
        </p>
        <p className="small muted">Trial: new workspaces start on the Free plan. Paid trials, if offered, are shown here once a subscription exists — no trial is assumed.</p>
      </div>
      <BillingPlans currentPlan={currentPlan} />
    </AppShell>
  );
}
