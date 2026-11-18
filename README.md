# PlaseSent

AI-powered B2B cold email outreach & sales engagement SaaS.

- **Marketing site:** the original static export is preserved at `public/marketing.html`.
- **App:** Next.js 15 (App Router) + React 19 + TypeScript, Drizzle ORM + libSQL
  (SQLite file locally, Turso in production). See `ARCHITECTURE.md` for the full
  audit, architecture, and what is live vs. awaiting credentials.

## Quick start (local)

```sh
cp .env.example .env.local   # fill in ENCRYPTION_KEY at minimum (openssl rand -hex 32)
npm install
npm run db:migrate           # creates ./data/plasesent.db (23 tables; also auto-runs on server start)
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
`TURSO_*`, `APP_URL=https://plasesent.vercel.app`). The app auto-migrates its
schema on server start (`src/instrumentation.ts`). Background sending needs a
separate worker/cron hitting the send queue (see `scripts/send-queue.ts`);
do not run persistent jobs inside serverless functions.
