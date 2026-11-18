import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, makeId, now } from "@/lib/db";
import { subscriptions, workspaces } from "@/lib/db/schema";

/**
 * Stripe webhook. Verifies the signature with STRIPE_WEBHOOK_SECRET; without
 * that secret the webhook is refused outright — a subscription is NEVER marked
 * paid from an unverified payload or a frontend success message.
 * Handled (verified only): checkout.session.completed, invoice.paid,
 * invoice.payment_failed.
 */
export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "webhook not configured", status: "awaiting_credentials", detail: "STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET is not set — unverified webhooks are never trusted." }, { status: 503 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing stripe-signature header" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return NextResponse.json({ error: "invalid webhook signature", detail: String(e).slice(0, 200) }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const wsId = s.metadata?.workspace_id;
      const plan = s.metadata?.plan ?? "growth";
      if (!wsId) return NextResponse.json({ received: true, note: "no workspace_id in metadata — nothing updated" });
      const existing = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, wsId)).limit(1);
      const stripeSubId = typeof s.subscription === "string" ? s.subscription : null;
      const values = {
        plan, status: "active",
        stripeCustomerId: typeof s.customer === "string" ? s.customer : null,
        stripeSubscriptionId: stripeSubId,
        updatedAt: now(),
      };
      if (existing[0]) {
        await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing[0].id));
      } else {
        await db.insert(subscriptions).values({ id: makeId("sub"), workspaceId: wsId, createdAt: now(), currentPeriodEnd: null, ...values });
      }
      await db.update(workspaces).set({ plan, updatedAt: now() }).where(eq(workspaces.id, wsId));
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const inv = event.data.object as Stripe.Invoice;
      const subId = typeof inv.subscription === "string" ? inv.subscription : null;
      if (subId) {
        const rows = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, subId)).limit(1);
        if (rows[0]) {
          const status = event.type === "invoice.paid" ? "active" : "past_due";
          await db.update(subscriptions).set({ status, updatedAt: now() }).where(eq(subscriptions.id, rows[0].id));
        }
      }
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    return NextResponse.json({ error: "webhook handling failed", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
