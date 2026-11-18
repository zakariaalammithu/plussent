# PlusSent — Audit, Architecture & Roadmap

## 1. Audit (2026-11-18)

### What existed before this build
- GitHub `zakariaalammithu/plussent`, branch `main`, one commit (`c0ccb62`):
  `index.html` (104 KB static marketing export) + `README.md`. No backend, no database,
  no auth, no sending — a marketing page only.
- Live: `https://plasesent.vercel.app/` returned HTTP 200 (the marketing export). The Vercel project still carries the old name — rename it to `plussent` in the Vercel dashboard (and add the intended custom domain `plussent.com`) so the live URL becomes `https://plussent.vercel.app/`.
- A separate Muse artifact (`plussent`) holds the same marketing site (static, no backend).
- Reference codebase `~/workspace/instantly` (not in this repo): Next.js 16 + React 19 +
  Cloudflare Worker (`worker/index.ts`, 824 lines, all APIs in one file) + D1/Drizzle,
  dashboard/campaigns/leads/CRM/inbox/admin, Stripe/OpenAI/Gmail/Outlook env vars.
  Its tests pass 34/34 (`node --test tests/*.mjs`) but `npm run build` FAILS because
  `vite.config.ts` imports `./build/sites-vite-plugin` and the `build/` folder was
  excluded from the zip the user sent — that folder is still on the user's PC.
  Patterns (Drizzle schema, workspace/member model, rate-limited worker) were reused;
  Instantly branding/text/assets were NOT copied.

### What was missing (all of it, before this build)
Auth, sessions, RBAC, tenant isolation, leads, campaigns, sequences, sending engine,
unified inbox, warmup/deliverability, analytics, billing, admin, AI, tests, migrations.

## 2. Architecture (chosen)

- **Stack: Next.js 15 (App Router) + React 19 + TypeScript, hosted on Vercel**
  (chosen because the Vercel project already exists; rename it from `plasesent` to
  `plussent` in the Vercel dashboard — the rename cannot be done from this repo).
- **Database: Drizzle ORM + libSQL (SQLite)** — `file:./data/plussent.db` locally;
  hosted libSQL (Turso) via `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` in production.
  No Supabase introduced (existing stack had none; libSQL covers the need).
- **Auth:** email+password (bcryptjs), opaque session tokens (SHA-256 hashed in DB,
  httpOnly cookies, multi-device sessions), email verification + password-reset tokens,
  TOTP 2FA structure (RFC 6238, Node crypto), login-attempt logging + rate limiting,
  RBAC (owner/admin/member/viewer) + super-admin flag.
- **Tenant isolation:** every tenant table has `workspaceId`; all queries filter by the
  session workspace. Tested in `tests/tenant-isolation.test.mjs`.
- **Credentials:** AES-256-GCM (`ENCRYPTION_KEY`), never plaintext, never in logs/responses.
- **Sending:** queue in DB (`email_messages`, idempotency keys); worker `scripts/send-queue.ts`
  processes the queue via SMTP/nodemailer, respects daily limits, stop-on-reply/bounce/
  unsubscribe, exponential backoff. Gmail/Outlook OAuth scaffolding (auth URL + token
  exchange + encrypted storage) is implemented; live sending requires user OAuth/SMTP creds.
- **AI:** provider interface `src/lib/ai/providers.ts` — `muse` | `openai` | `anthropic` |
  `heuristic`. **There is NO verified Muse AI endpoint in any codebase here**, so Muse
  returns `awaiting_credentials` until the user supplies a documented endpoint + key.
  OpenAI/Anthropic call their real APIs when keys are present. Heuristic fallback
  (spam check, reply classification) is always labelled `heuristic`.
- **Billing:** Stripe scaffolding — checkout only when `STRIPE_SECRET_KEY` is set;
  webhooks verified with `stripe.webhooks.constructEvent`; a subscription is NEVER
  marked paid from a frontend success message. Without keys: `awaiting_credentials`.
- **Marketing:** the original `index.html` export is preserved at `public/marketing.html`;
  the app `/` route is the PlusSent landing page (original copy).

## 3. What CANNOT be verified live without credentials
Gmail/Outlook OAuth (needs Google/Microsoft OAuth clients + redirect URIs), real SMTP
sending (needs SMTP host/user/pass), Stripe checkout/webhooks (needs Stripe keys),
OpenAI/Anthropic/Muse AI (needs keys / a documented Muse endpoint), DNS/SPF/DKIM/DMARC
for a real sending domain (needs a domain the user owns), inbox placement (needs a
supported placement-testing provider). Each is implemented end-to-end with a config
surface in Settings → Integrations / AI Providers / Billing, and is marked
`awaiting_credentials` in the completion report until verified live.

## 4. Roadmap status (see completion report in the parent handoff)
Phase 1 audit ✓ · Phase 2-3 core platform ✓ (auth, dashboard, leads, accounts,
campaigns, sequences, inbox) · Phase 4 AI ✓ (provider interface + heuristic) ·
Phase 5 tests + security ✓ · Phase 6 deploy + push ✓ (this commit).

## 5. Vercel build failure (2026-11-19) — root cause & fix

A fresh Vercel project import (`plussent`) failed at build time:
`Failed to collect page data for /api/admin/stats`, caused by
`ConnectionFailed("Unable to open connection to lo…")`, and
`plussent.vercel.app` then returned 404 `DEPLOYMENT_NOT_FOUND` because no
deployment had ever succeeded.

Root cause: `src/lib/db/index.ts` called `createClient()` at module import
time, defaulting to a local SQLite file (`file:./data/plussent.db`). Vercel's
build machine has no such file and a read-only filesystem, so when Next.js
statically collected page data for API routes, the import itself tried to open
a connection and crashed the build. Local builds passed only because
`./data/plussent.db` existed locally. `src/instrumentation.ts` also ran the
schema check on server start, which could hit the DB during build-time
collection, and no API route declared `dynamic = "force-dynamic"`.

Fix (no feature logic changed):
- `src/lib/db/index.ts` — DB client is now created lazily (a Proxy over the
  drizzle instance; `getDb()` on first query). Importing the module opens no
  connection. On Vercel with no DB configured, `getDb()` throws a clear
  `database not configured` error instead of a libSQL connection failure.
- All 40 API routes under `src/app/api/` now declare
  `export const dynamic = "force-dynamic"` so Next never statically collects
  page data for them at build time.
- `src/instrumentation.ts` — schema check is skipped during
  `phase-production-build` and on Vercel when no DB URL is configured.
- `scripts/migrate.ts` — `main()` only runs when invoked as a CLI script, not
  as an import side effect (it used to run migrations and could `process.exit`
  on import).

Verified: clean `npm run build` passes with no `DATABASE_URL`/`TURSO_*` set
and no `./data` directory (the Vercel build conditions); tests 33/33 pass; a
production smoke run against a temp file DB still signs up, logs in, and
serves the app. Without a Turso DB the build passes but auth returns an
honest 500 `database not configured` — see README "Deploy (Vercel)".
