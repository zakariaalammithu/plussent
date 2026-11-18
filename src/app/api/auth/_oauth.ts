// OAuth shared logic for Google + Microsoft (PlusSent auth module).
// Start endpoints build the REAL authorization URL from env vars; callback
// endpoints exchange the code for tokens ONLY when the provider is configured.
// Nothing is invented: no configured client id/secret => 503 oauth_not_configured.
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  auditLog,
  createPersonalWorkspace,
  createSession,
  getClientIp,
  getUserMemberships,
  setSessionCookie,
} from "@/lib/auth";
import { encryptSecret, randomToken } from "@/lib/crypto";
import { db, makeId, now } from "@/lib/db";
import { emailAccounts, subscriptions, users } from "@/lib/db/schema";
import { appUrl } from "@/lib/mailer";

export type OAuthProvider = "google" | "microsoft";

export interface OAuthConfig {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  redirectUri: string;
}

/** Returns null when the provider is not configured (missing id or secret). */
export function oauthConfig(provider: OAuthProvider): OAuthConfig | null {
  const redirectUri = `${appUrl()}/api/auth/${provider}/callback`;
  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
    if (!clientId || !clientSecret) return null;
    return {
      provider,
      clientId,
      clientSecret,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      scope: "openid email profile",
      redirectUri,
    };
  }
  const clientId = process.env.MICROSOFT_CLIENT_ID ?? "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) return null;
  return {
    provider,
    clientId,
    clientSecret,
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2/token",
    userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    scope:
      "openid email profile offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send",
    redirectUri,
  };
}

export function buildAuthUrl(cfg: OAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: cfg.scope,
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export async function exchangeCode(cfg: OAuthConfig, code: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`oauth token exchange failed: ${res.status}`);
  }
  return (await res.json()) as TokenSet;
}

export interface OAuthProfile {
  email: string;
  name?: string | null;
}

export async function fetchOAuthProfile(
  cfg: OAuthConfig,
  accessToken: string,
): Promise<OAuthProfile> {
  const res = await fetch(cfg.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`oauth profile fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const email =
    typeof data.email === "string"
      ? data.email
      : typeof data.mail === "string"
        ? data.mail
        : typeof data.userPrincipalName === "string"
          ? data.userPrincipalName
          : "";
  if (!email) throw new Error("oauth profile has no email");
  const name =
    typeof data.name === "string"
      ? data.name
      : typeof data.displayName === "string"
        ? data.displayName
        : null;
  return { email: email.toLowerCase(), name };
}

// ------------------------------------------------------------ start + callback
/** Start handler shared by /api/auth/google and /api/auth/microsoft (GET). */
export function handleOAuthStart(provider: OAuthProvider): Response {
  const cfg = oauthConfig(provider);
  if (!cfg) {
    return NextResponse.json({ error: "oauth_not_configured" }, { status: 503 });
  }
  const state = randomToken(16);
  const res = NextResponse.redirect(buildAuthUrl(cfg, state));
  res.cookies.set("ps_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}

/**
 * Callback handler shared by /api/auth/google/callback and
 * /api/auth/microsoft/callback (GET). Verifies state, exchanges the code,
 * finds-or-creates the user (+ personal workspace + free subscription for
 * new users), stores the ENCRYPTED token set in email_accounts, creates a
 * session and redirects to /dashboard.
 */
export async function handleOAuthCallback(
  provider: OAuthProvider,
  req: NextRequest,
): Promise<Response> {
  const cfg = oauthConfig(provider);
  if (!cfg) {
    return NextResponse.json({ error: "oauth_not_configured" }, { status: 503 });
  }
  const loginUrl = `${appUrl()}/login`;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const providerError = req.nextUrl.searchParams.get("error");
  if (providerError || !code || !state) {
    return NextResponse.redirect(`${loginUrl}?error=oauth_failed`);
  }
  const storedState = req.cookies.get("ps_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${loginUrl}?error=oauth_state_mismatch`);
  }

  let tokens: TokenSet;
  let profile: OAuthProfile;
  try {
    tokens = await exchangeCode(cfg, code);
    profile = await fetchOAuthProfile(cfg, tokens.access_token);
  } catch (err) {
    console.error(`[plussent] oauth ${provider} callback failed`, err);
    return NextResponse.redirect(`${loginUrl}?error=oauth_failed`);
  }

  let [user] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
  let workspaceId: string;
  if (!user) {
    const userId = makeId("usr");
    await db.insert(users).values({
      id: userId,
      email: profile.email,
      passwordHash: null,
      fullName: profile.name ?? null,
      emailVerifiedAt: now(),
      totpSecret: null,
      totpEnabled: 0,
      status: "active",
      isSuperAdmin: 0,
      createdAt: now(),
      updatedAt: now(),
    });
    const workspace = await createPersonalWorkspace(
      userId,
      profile.name ?? profile.email.split("@")[0],
    );
    await db.insert(subscriptions).values({
      id: makeId("sub"),
      workspaceId: workspace.id,
      plan: "free",
      status: "trialing",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      createdAt: now(),
      updatedAt: now(),
    });
    [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    workspaceId = workspace.id;
    await auditLog({ workspaceId, userId, action: "user.oauth_signup", entity: "user", entityId: userId });
  } else {
    const memberships = await getUserMemberships(user.id);
    if (!memberships.length) {
      const workspace = await createPersonalWorkspace(
        user.id,
        profile.name ?? profile.email.split("@")[0],
      );
      workspaceId = workspace.id;
    } else {
      workspaceId = memberships[0].workspaceId;
    }
  }

  // Store the OAuth tokens encrypted — never plaintext — as a connected
  // email account for this workspace.
  const providerName = provider === "google" ? "gmail" : "outlook";
  const encrypted = encryptSecret(JSON.stringify(tokens));
  const [existingAccount] = await db
    .select({ id: emailAccounts.id })
    .from(emailAccounts)
    .where(
      and(
        eq(emailAccounts.workspaceId, workspaceId),
        eq(emailAccounts.provider, providerName),
        eq(emailAccounts.email, profile.email),
      ),
    )
    .limit(1);
  if (existingAccount) {
    await db
      .update(emailAccounts)
      .set({ encryptedCredentials: encrypted, status: "connected", lastError: null, updatedAt: now() })
      .where(eq(emailAccounts.id, existingAccount.id));
  } else {
    await db.insert(emailAccounts).values({
      id: makeId("ea"),
      workspaceId,
      provider: providerName,
      email: profile.email,
      displayName: profile.name ?? null,
      encryptedCredentials: encrypted,
      status: "connected",
      lastError: null,
      dailyLimit: 100,
      sentToday: 0,
      sentTodayDate: null,
      healthScore: 100,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  const { token } = await createSession({
    userId: user.id,
    workspaceId,
    userAgent: req.headers.get("user-agent"),
    ip: getClientIp(req),
  });
  const res = NextResponse.redirect(`${appUrl()}/dashboard`);
  res.cookies.set("ps_oauth_state", "", { path: "/", maxAge: 0 });
  return setSessionCookie(res, token);
}
