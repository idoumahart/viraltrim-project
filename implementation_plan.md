# Implementation Plan: viraltrim.codedmotion.studio

## Phase 0: Preparation (Backup, Environment Verification)

1. Verify environment tools are installed (`bun`, `wrangler`, `git`).
2. Run database backup commands for safety:
```bash
npx wrangler d1 backup create viraltrim-db
```
3. Backup KV namespaces:
```bash
npx wrangler kv:key list --namespace-id <ID> > kv_backup.json
```
4. Verify current codebase state. Verify Wrangler is authenticated with Cloudflare.
```bash
npx wrangler whoami
```

---

## Phase 1: Critical Security Fixes (Must do first)

### 1.1 Replace bcryptjs with WebCrypto PBKDF2

#### [MODIFY] [auth.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/auth.ts)

Replace `bcryptjs` hashing functions with native WebCrypto PBKDF2 to prevent CPU timeouts (Error 1102) on Cloudflare Workers.

```typescript
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return `${Buffer.from(salt).toString("hex")}:${Buffer.from(hash).toString("hex")}`;
}

export async function verifyPassword(password: string, hashStr: string): Promise<boolean> {
  const [saltHex, originalHashHex] = hashStr.split(":");
  if (!saltHex || !originalHashHex) return false;
  
  const salt = new Uint8Array(Buffer.from(saltHex, "hex"));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  const newHashHex = Buffer.from(hash).toString("hex");
  return newHashHex === originalHashHex;
}
```

[Verification: test login/register locally by creating an account and logging in]

### 1.2 Add Security Headers Middleware (CSP, HSTS, etc.)

#### [NEW] [security-headers.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/middleware/security-headers.ts)

Create file:

```typescript
export const securityHeadersPlugin = async (c: any, next: any) => {
  await next();
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", 
      "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
      "font-src 'self' https://api.fontshare.com data:",
      "img-src 'self' data: blob: https://img.youtube.com https://i.ytimg.com https://raw.githubusercontent.com",
      "media-src 'self' blob: https:",
      "connect-src 'self' https://generativelanguage.googleapis.com https://api.stripe.com",
      "frame-src https://www.youtube.com https://js.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self' https://checkout.stripe.com",
      "upgrade-insecure-requests",
    ].join("; ")
  );
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
};
```

#### [MODIFY] [index.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/index.ts)

Add the middleware after CORS plugin. Check if the file needs the import added: `import { securityHeadersPlugin } from "./middleware/security-headers";` and `app.use("*", securityHeadersPlugin);`

#### [MODIFY] [wrangler.jsonc](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/wrangler.jsonc)

Remove `http://localhost:3000` from `ALLOWED_ORIGINS` for production deploy logic to tighten CORS rules.

[Verification: run `curl -I https://viraltrim.codedmotion.studio/` after deploy to verify headers]

### 1.3 Move JWT to HttpOnly Cookie

#### [MODIFY] [userRoutes.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/userRoutes.ts)

Refactor to generate HttpOnly session cookies leveraging `hono/cookie`:

```typescript
import { setCookie, deleteCookie, getCookie } from "hono/cookie";

// on login / register success, instead of just dumping token in JSON body:
setCookie(c, "vt_session", token, {
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
  path: "/",
  maxAge: ttl,
});

// Update Auth middleware reading mechanism:
// Read from Cookie if 'Authorization' header is blank.
```

#### [MODIFY] [api-client.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/src/lib/api-client.ts)

Remove `localStorage.getItem("viraltrim_token")` references completely and remove it from the outgoing Bearer `Authorization` headers on subsequent fetch requests. Rely on the browser's credentials to pass the cookie.

[Verification: Log in and inspect the Application tab in DevTools; token should exist as a `vt_session` cookie marked `HttpOnly`]

### 1.4 Restrict Avatar Uploads to Images

#### [MODIFY] [userRoutes.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/userRoutes.ts)

Apply strict MIME type validation for uploads to patch arbitrary file uploads and potential same-origin XSS holes:

```typescript
const file = form.get("file");
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
if (!ALLOWED.has(file.type)) return c.json({ error: "Invalid image type" }, 400);

const ext = file.type.split("/")[1];
const key = `avatars/${user.id}/${generateId()}.${ext}`;
// Ensure 'X-Content-Type-Options' is served with "nosniff" implicitly via CDN or by appending to the endpoint.
```

[Verification: Submit a simulated `.html` file with `text/html` MIME directly targeting the upload API path; verify 400 response code returned]

---

## Phase 2: High Severity Fixes

### 2.1 Add Rate Limiting on Auth Endpoints

#### [NEW] [rate-limiter.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/middleware/rate-limiter.ts)

Implement KV based rate limiting middleware handling parameters appropriately.

#### [MODIFY] [userRoutes.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/userRoutes.ts)

Apply rate limitation logic on `/api/auth/login` and `/api/auth/register` to deter credential stuffing (e.g., 5 requests per IP+email per 15 mins).

[Verification: Fire 5 rapid login requests; verify exactly a 429 status code response triggers on the excess queries]

### 2.2 Fix Checkout – Remove Client‑trusted trialDays/quantity

#### [MODIFY] [userRoutes.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/userRoutes.ts)

Remove logic implicitly consuming user-provided pricing metrics from `c.req.json()`:

```typescript
const trialDays = false; // hard-coded from environment pricing matrix
const quantity = 1; // single tier constraint verified by server side logic.
```

[Verification: Try sending JSON body `{ "trialDays": 100 }` on Stripe session generation post hook; ensure Stripe Checkout UI overrides the parameter properly]

### 2.3 Add Stripe Webhook Idempotency

#### [MODIFY] [schema.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/database/schema.ts)

Add `processed_webhook_events` tracking table constraints (id, event_id [UNIQUE], processed_at). Add table object to schema payload.

#### [MODIFY] [userRoutes.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/userRoutes.ts)

Implement checking before processing webhook data. Reply HTTP 400 on bad webhook signature or 500 on application crashes, and don't dump 200 without validation:

```typescript
// early verification check logic...
if (existingEvent) return c.json({ received: true }); 
// after successful execution tree:
await db.insert(processedWebhookEvents).values({ eventId: event.id });
```

[Verification: Send duplicate event IDs using Stripe CLI `stripe trigger`; verify logs indicate skipped rather than double processed]

### 2.4 Add Logout Endpoint with Session Revocation

#### [MODIFY] [userRoutes.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/userRoutes.ts)

Introduce `POST /api/auth/logout`:

```typescript
api.post("/api/auth/logout", authMiddleware, async (c) => {
  const token = getCookie(c, "vt_session") || extractBearerToken(c.req.raw);
  if (token) await revokeSession(createDatabase(c.env.DB), token, c.env.JWT_SECRET);
  deleteCookie(c, "vt_session", { path: "/" });
  return c.json({ success: true });
});
```

[Verification: Try using the app interface to logout, capture XHR indicating success and ensuing token invalidation check]

### 2.5 Lazy‑load Routes and React Player

#### [MODIFY] [main.tsx](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/src/main.tsx)
#### [MODIFY] [EditorPage.tsx](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/src/pages/EditorPage.tsx)

Implement `React.lazy()` around top-level application Routes (like `EditorPage`, `DiscoveryPage`) and wrap critical intersections such as `react-player` in `Suspense` placeholders.

[Verification: Analyze Vite bundle size reductions targeting `main`]

---

## Phase 3: Medium Severity Fixes

### 3.1 Prompt Sanitization / Gemini Protect

#### [MODIFY] [gemini.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/gemini.ts)

Safeguard prompt injection inputs securely bypassing parameter strings safely with character limitations:
```typescript
const safeCategory = JSON.stringify(String(category).slice(0, 100).replace(/[\n\r`]/g, ""));
```

### 3.2 Add SEO Metadata and Structured Data

#### [MODIFY] [index.html](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/index.html)
Add canonical URL `<link rel="canonical" href="https://viraltrim.codedmotion.studio/" />`, `<meta name="robots" content="index,follow" />`, and baseline OpenGraph metadata block. Remove absolute referencing to githubusercontent for favicon.

#### [NEW] [robots.txt](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/public/robots.txt)
```txt
User-agent: *
Allow: /
Sitemap: https://viraltrim.codedmotion.studio/sitemap.xml
```

#### [NEW] [sitemap.xml](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/public/sitemap.xml)
Minimalistic sitemap definition payload pointing domain scope targets.

> [!CAUTION]
> 🧑 HUMAN TASK: Create standard `og-image.png` and favicon artifacts locally then bundle inside `public/` directory or push directly via Cloudflare Pages deployment to hydrate metadata queries correctly.

### 3.3 Enable TypeScript Strict Mode and Fix Errors

#### [MODIFY] [tsconfig.app.json](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/tsconfig.app.json)

Change logic inside `tsconfig` environment block checking flag array configurations mapping strictly `"strict": true`. 

#### [MODIFY] [accordion.tsx](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/src/components/ui/accordion.tsx)
Target known corruption regarding inline import orders within this module if existent. Ensure proper resolution.

[Commands: run `bun run typecheck` or `npx tsc --noEmit` traversing resolving TS mismatches]
[Verification: Console terminates cleanly over complete TS module crawl]

### 3.4 Password Complexity Validation

#### [MODIFY] [user-service.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/database/services/user-service.ts)
Pre-flight string length logic mapping: Ensure minimal characters length rules (e.g. 12 character minimal requirement constraint implementation).

### 3.5 Add Session Cleanup Job (Cron Trigger)

#### [NEW] [session-cleanup.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/cron/session-cleanup.ts)
Set isolated cron invocation code to prune `DELETE FROM sessions WHERE expires_at < NOW()`.

#### [MODIFY] [wrangler.jsonc](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/wrangler.jsonc)
Inject mapping defining cron trigger configurations pointing to newly resolved module endpoint.

---

## Phase 4: Low Severity / Nice to Have

### 4.1 Add Structured Logging

#### [NEW] [logger.ts](file:///c:/Users/moeal/OneDrive/Documents/Antigravity%20Projects/Viral%20Trim%20project/worker/logger.ts)
Replace internal worker console tracing logic emitting cleanly parsable blocks using abstraction libraries (e.g. Pino).

---

## Phase 5: Verification & Deployment

### 5.1 Run Full Test Suite

[Commands]
```bash
bun run build
bun run typecheck
```

### 5.2 Deploy to Cloudflare Workers

[Commands]
```bash
npx wrangler deploy --dry-run
npx wrangler deploy
```

> [!WARNING]
> 🧑 HUMAN TASK: Check `wrangler.jsonc` KV namespace settings. If `REPLACE_WITH_KV_SESSIONS_ID` placeholders persist, generate actual IDs:
> ```bash
> npx wrangler kv:namespace create SESSIONS
> npx wrangler kv:namespace create CACHE
> npx wrangler r2 bucket create viraltrim-media
> ```
> Put the output object `id`s directly inside `wrangler.jsonc`.

### 5.3 Post‑Deployment Validation Checklist

> [!CAUTION]
> 🧑 HUMAN TASK: Test explicit live headers:
> ```bash
> curl -I https://viraltrim.codedmotion.studio/
> curl -I https://viraltrim.codedmotion.studio/api/auth/login
> ```
> 
> 🧑 HUMAN TASK: Authenticate and securely seed secrets:
> ```bash
> npx wrangler secret put STRIPE_WEBHOOK_SECRET
> npx wrangler secret put JWT_SECRET
> ```
> 
> 🧑 HUMAN TASK: Login manually across the frontend to assure `bcryptjs` timeout remediation via `WebCrypto` functioned positively.

---

## Appendix: Complete List of Human Tasks

| Task | Action | Verification |
| --- | --- | --- |
| 🧑 KV/R2 Provisioning | Run `wrangler kv:namespace create` and put IDs in `wrangler.jsonc`. | Worker Deploy builds appropriately. |
| 🧑 Production Secrets | Run `npx wrangler secret put` pushing remote tokens for Stripe Webhook and JWT secrets. | Auth limits persist and Payments properly hook responses implicitly. |
| 🧑 OG Media Initialization | Construct standard image graphic assets including SVG Favicons and link appropriately inside `public/`. | Discord testing shows proper domain snippet propagation formats visually. |
| 🧑 API Curl Live Testing | Trigger cURL diagnostic mapping to remote instance. | Response headers assert X-Content/HSTS/CSP strings explicitly. |
| 🧑 Stripe Environment Test | Create sample purchases and verify endpoint targets inside Webhook configuration rules on Dashboard panel correctly map back payload. | Payment transactions accurately increment subscriptions internally. |
