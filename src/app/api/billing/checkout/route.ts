import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getWorkspaceAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const PLANS = ["free", "starter", "growth", "agency", "enterprise"] as const;
type Plan = (typeof PLANS)[number];

const PRICE_ENV: Partial<Record<Plan, string>> = {
  starter: "STRIPE_PRICE_STARTER",
  growth: "STRIPE_PRICE_GROWTH",
  agency: "STRIPE_PRICE_AGENCY",
};

/** POST { plan } -> Stripe Checkout session. 503 when Stripe is not configured. */
export async function POST(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const workspaceId = auth.workspaceId;
  const userEmail = auth.user.email;
  const userId = auth.userId;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const plan = (body as { plan?: string }).plan as Plan | undefined;
  if (!plan || !PLANS.includes(plan)) return NextResponse.json({ error: "valid plan is required (free | starter | growth | agency | enterprise)" }, { status: 400 });
  if (plan === "free") return NextResponse.json({ error: "the free plan needs no checkout" }, { status: 400 });
  if (plan === "enterprise") {
    return NextResponse.json({ error: "enterprise is custom — contact sales; no checkout session is created for it", status: "awaiting_contact" }, { status: 400 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "billing is not configured", status: "awaiting_credentials", detail: "STRIPE_SECRET_KEY is not set." }, { status: 503 });
  }
  const priceEnv = PRICE_ENV[plan];
  const priceId = priceEnv ? process.env[priceEnv] : undefined;
  if (!priceId) {
    return NextResponse.json({ error: "billing is not configured", status: "awaiting_credentials", detail: `${priceEnv} is not set — no Stripe price exists for the ${plan} plan.` }, { status: 503 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: userEmail,
      success_url: `${appUrl}/billing?checkout=success`,
      cancel_url: `${appUrl}/billing?checkout=cancelled`,
      metadata: { workspace_id: workspaceId, plan, user_id: userId },
    });
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    return NextResponse.json({ error: "Stripe checkout failed", detail: String(e).slice(0, 300) }, { status: 502 });
  }
}
