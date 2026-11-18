# PlusSent

AI-powered B2B cold email outreach & sales engagement SaaS.

- **Marketing site:** the original static export is preserved at `public/marketing.html`.
- **App:** Next.js 15 (App Router) + React 19 + TypeScript, Drizzle ORM + libSQL
  (SQLite file locally, Turso in production). See `ARCHITECTURE.md` for the full
  audit, architecture, and what is live vs. awaiting credentials.

## Quick start (local)

```sh
cp .env.example .env.local   # fill in ENCRYPTION_KEY at minimum (openssl rand -hex 32)
npm install
npm run db:migrate           # creates ./data/plussent.db (23 tables; also auto-runs on server start)
# Rename note (2026-11-18): brand was PlaseSent; the local DB default moved from
# ./data/plasesent.db to ./data/plussent.db, so an old local file is not picked up
# (fresh DB auto-migrates). Sessions are unaffected — the cookie is `ps_session`.
npm run dev                  # http://localhost:3000
npm test                     # node --test, 33 tests
npm run build && npm start   # production build
```

Send queue worker (processes queued campaign emails via SMTP):

```sh
npm run worker:send-queue
```

## What works without any external credentials

Signup/login/logout, email verification + password reset flows (tokens in DB;
emails are only *sent* once SMTP is configured — the API reports
`verificationEmailSent:false / smtp_not_configured` honestly), TOTP 2FA,
multi-device sessions, RBAC + workspace tenant isolation, leads (CRUD, CSV import
with validation report, dedupe, tags), campaigns + multi-step sequences
(stop-on-reply/bounce/unsubscribe), unified inbox with heuristic reply
classification, warmup + SPF/DKIM/DMARC checks, real DB-driven analytics
(zeros until data exists — never fake stats), AI via the local heuristic
provider, admin panel, team workspaces.

## What needs credentials (all surfaced as `awaiting_credentials`, never faked)

- **SMTP** (`SMTP_HOST/USER/PASS`) — real email sending + verification emails.
- **Google / Microsoft OAuth** (`GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`)
  + redirect URIs `…/api/auth/google/callback`, `…/api/auth/microsoft/callback`.
- **AI** — `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` for live LLM calls. **Muse AI:**
  there is no verified Muse endpoint in this codebase; `MUSE_API_URL` +
  `MUSE_API_KEY` must be supplied with a documented endpoint before Muse is live.
- **Stripe** (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`) — checkout + webhooks (verified).
- **Hosted DB** (`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`) — otherwise a local
  SQLite file is used (not suitable for multi-instance Vercel; use Turso).

## Deploy (Vercel)

Import this repo in Vercel (Framework: Next.js). Set env vars above
(`ENCRYPTION_KEY`, `SESSION_SECRET` — generate 32+ byte secrets — plus
`TURSO_*`, `APP_URL=https://plussent.vercel.app`). Rename the Vercel project from
`plasesent` to `plussent` first (Vercel dashboard), and add the intended custom domain
`plussent.com` there. The app auto-migrates its
schema on server start (`src/instrumentation.ts`). Background sending needs a
separate worker/cron hitting the send queue (see `scripts/send-queue.ts`);
do not run persistent jobs inside serverless functions.

### Production database (required — a local file DB cannot work on Vercel)

Vercel's build machine has no DB file and a read-only filesystem, and its
serverless functions have no shared disk, so the local `file:./data/plussent.db`
default is local-dev only. For a working production deploy:

1. Create a free database at https://turso.tech (or any libSQL host) and copy
   its URL + auth token.
2. In Vercel → your project → Settings → Environment Variables, set
   `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (plus `ENCRYPTION_KEY`,
   `SESSION_SECRET`, `APP_URL=https://plussent.vercel.app`).
3. Redeploy (Deployments → ⋯ → Redeploy, or push a new commit).

Without a Turso DB the build now **passes** (the DB client is created lazily,
API routes are `force-dynamic`, and the startup schema check is skipped during
build), but signups/logins will honestly return a 500
`database not configured` until those two vars are set and the app is redeployed.
That is by design — the app never pretends to work without a database.

> Build failure fixed 2026-11-19: the DB client used to be created at module
> import time, so Vercel's "Collecting page data" step tried to open a
> connection and the whole deployment failed (`Failed to collect page data for
> /api/admin/stats`). See `ARCHITECTURE.md` §5.

## Branding

Official assets (unmodified) live in `public/brand/`: `plussent-logo.png`
(full horizontal logo, white background — always shown on a white rounded
surface, see `src/app/_components/BrandLogo.tsx`) and `plussent-icon.png`
(standalone transparent icon — favicon, Apple Touch Icon, PWA icons).
Brand colours: coral red `#FF3038`, dark navy `#071525`, white `#FFFFFF`
(see `src/app/globals.css`). Favicon is a real multi-size `.ico`
(16/32/48) generated from the icon PNG; `public/manifest.json` references
the 192/512 PWA icons.
