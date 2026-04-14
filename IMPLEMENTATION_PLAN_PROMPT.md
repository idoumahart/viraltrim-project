# Expert Engineering Prompt: Implementation Plan from Combined Audit

You are a senior full-stack engineer and SRE with 15+ years of experience. Your task is to produce a **comprehensive, step‑by‑step implementation plan** that fixes all issues identified in the combined audits of `viraltrim.codedmotion.studio` (DeepSeek v2, ArchitectGPT, Gemini 3.1 Pro, Sonnet 4.6). You must merge the best findings from all audits, eliminate any false positives, and create a single actionable plan.

## Input Data

You have access to the following audits (provided in the conversation):

1. **DeepSeek v2** – most complete, accurate, includes `bcryptjs` CPU fix.
2. **ArchitectGPT** – excellent breadth, missed `bcryptjs`.
3. **Gemini 3.1 Pro** – deep backend insights (webhook idempotency, prompt injection, crypto).
4. **Sonnet 4.6** – detailed action plan but with factual errors (ignore its false claims about missing Stripe routes and fake viral discovery).

Also you have the **original source files** (listed earlier: `package.json`, `wrangler.jsonc`, `worker/index.ts`, `worker/userRoutes.ts`, `worker/auth.ts`, `worker/gemini.ts`, `src/lib/api-client.ts`, `src/main.tsx`, etc.) and the **live site URL** `https://viraltrim.codedmotion.studio` (though you cannot directly access it, you can infer from source).

## Your Task

Produce a single Markdown document that serves as an **execution plan** to bring the site to a production‑ready, secure, and performant state. The plan must:

1. **Prioritize fixes** by severity (Critical → High → Medium → Low) and dependencies.
2. **Provide exact code changes** for every file modification (full file replacements or precise diffs).
3. **Include all necessary commands** (e.g., `wrangler` commands, `bun` commands, `git` commands).
4. **Clearly separate AI‑automatable tasks** from **🧑 HUMAN TASK** actions that cannot be automated (e.g., setting secrets in Cloudflare Dashboard, verifying live headers, running Stripe webhook configuration).
5. **Include verification steps** after each major phase (e.g., `curl` commands, typecheck, build test, deploy dry‑run).
6. **Cover all critical issues** from the combined audits, especially:
   - `bcryptjs` → WebCrypto replacement (critical)
   - CSP and security headers middleware (critical)
   - Move JWT from `localStorage` to `HttpOnly` cookie (critical)
   - Restrict avatar uploads to safe image MIME types (critical)
   - Add rate limiting on auth endpoints (high)
   - Remove client‑trusted `trialDays`/`quantity` from checkout (high)
   - Add Stripe webhook idempotency (high)
   - Fix logout endpoint (high)
   - Lazy‑load routes and player (high)
   - Add SEO metadata, structured data, `robots.txt`, `sitemap.xml` (medium)
   - Enable TypeScript `strict` mode and fix corrupted component files (medium)
   - Add session cleanup job (low)
7. **Include a final checklist** for human to verify deployment success (headers, API tests, Stripe webhook, etc.).

## Output Format

Produce the plan as a single Markdown document with the following sections:

# Implementation Plan: viraltrim.codedmotion.studio

## Phase 0: Preparation (Backup, Environment Verification)

[Commands to backup D1, R2, KV, and verify current state]

## Phase 1: Critical Security Fixes (Must do first)

### 1.1 Replace bcryptjs with WebCrypto PBKDF2

[File: worker/auth.ts – full replacement code]
[Verification: test login/register locally]

### 1.2 Add Security Headers Middleware (CSP, HSTS, etc.)

[File: worker/middleware/security-headers.ts – new file]
[File: worker/index.ts – integration changes]
[Verification: curl headers after deploy]

### 1.3 Move JWT to HttpOnly Cookie

[File: worker/userRoutes.ts – modify login/register/logout]
[File: src/lib/api-client.ts – remove localStorage logic]
[Verification: token not visible in DevTools]

### 1.4 Restrict Avatar Uploads to Images

[File: worker/userRoutes.ts – modify upload endpoint]
[Verification: upload HTML file → rejected]

## Phase 2: High Severity Fixes

### 2.1 Add Rate Limiting on Auth Endpoints

[File: worker/middleware/rate-limiter.ts – new file]
[File: worker/userRoutes.ts – apply to login/register]
[Verification: 5 rapid requests → 429]

### 2.2 Fix Checkout – Remove Client‑trusted trialDays/quantity

[File: worker/userRoutes.ts – hardcode server rules]
[Verification: client cannot override]

### 2.3 Add Stripe Webhook Idempotency

[File: worker/database/schema.ts – add processed_webhook_events table]
[File: worker/userRoutes.ts – modify webhook handler]
[Verification: duplicate event → no double processing]

### 2.4 Add Logout Endpoint with Session Revocation

[File: worker/userRoutes.ts – add POST /api/auth/logout]
[Verification: token invalid after logout]

### 2.5 Lazy‑load Routes and React Player

[File: src/main.tsx – wrap routes with React.lazy]
[File: src/pages/EditorPage.tsx – lazy load react-player]
[Verification: bundle size reduction]

## Phase 3: Medium Severity Fixes

### 3.1 Add SEO Metadata and Structured Data

[File: index.html – add canonical, OG image, Twitter Card]
[File: public/robots.txt – new file]
[File: public/sitemap.xml – new file]
[🧑 HUMAN TASK: Create OG image and upload to R2]

### 3.2 Enable TypeScript Strict Mode and Fix Errors

[File: tsconfig.app.json – set strict: true]
[Commands: fix type errors]
[Verification: tsc --noEmit passes]

### 3.3 Add Password Complexity Validation

[File: worker/userRoutes.ts – add validation before registration]

### 3.4 Add Session Cleanup Job (Cron Trigger)

[File: worker/cron/session-cleanup.ts – new file]
[File: wrangler.jsonc – add triggers]

## Phase 4: Low Severity / Nice to Have

### 4.1 Add Structured Logging

[File: worker/logger.ts – use pino or structured logs]

## Phase 5: Verification & Deployment

### 5.1 Run Full Test Suite

[Commands: typecheck, build, deploy dry‑run]

### 5.2 Deploy to Cloudflare Workers

[Commands: wrangler deploy]

### 5.3 Post‑Deployment Validation Checklist

[🧑 HUMAN TASK: Run provided curl commands, check Stripe webhook, verify headers]

## Appendix: Complete List of Human Tasks

[Consolidated table of all 🧑 HUMAN TASK items with clear instructions]

---

## Mandatory Rules

- **Do not hallucinate** – only propose changes that directly address issues from the audits. If a file path is uncertain, state “verify path” and provide likely location.
- **Provide exact code** – for every file change, output the complete file content or a precise diff. Use triple backticks with language.
- **Every command must be runnable** – include full commands (e.g., `bunx drizzle-kit generate`, `wrangler d1 execute ...`).
- **Mark human tasks explicitly** with `🧑 HUMAN TASK:` and describe exactly what the human must do, including where to click or what value to copy.
- **Include verification** – after each fix, tell the human how to verify it works (e.g., `curl` command, browser test).
- **Assume the human has `bun`, `wrangler`, and `git` installed** and is authenticated with Cloudflare.
- **Do not skip any critical issue** – if an issue cannot be fully automated, provide a manual workaround and document it.

## Final Instruction

Now, produce the implementation plan. Use the combined audits as your source of truth. Prioritize fixes that will unblock the site immediately. Make every step clear enough that a junior engineer could execute it without further explanation.
