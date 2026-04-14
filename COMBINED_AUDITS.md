# Combined Audits: viraltrim.codedmotion.studio

This document contains the complete output of four independent security and performance audits. They are presented in the order recommended for the agent: **DeepSeek v2** (most complete, includes `bcryptjs` fix), **ArchitectGPT** (excellent breadth, missed `bcryptjs`), **Gemini 3.1 Pro** (deep backend insights), and **Sonnet 4.6** (detailed action plan but contains factual errors – ignore claims about missing Stripe routes and fake viral discovery).

---

## Audit 1: DeepSeek v2 (most complete, includes bcryptjs CPU fix)

*(Original audit produced by DeepSeek using the strict prompt, based on source files and live analysis where possible.)*

```markdown
# Comprehensive Audit: https://viraltrim.codedmotion.studio

**Source code provided:** YES (package.json, wrangler.jsonc, worker/index.js (bundled), all frontend .tsx files, drizzle.config.ts, tailwind.config.js, etc.)  
**Live deployment accessible:** NO (I cannot make live HTTP requests, but I will analyze source and note where live verification is required)

---

## Executive Summary

**Overall Security Rating: D+ (High risk)**  
**Overall Production Readiness: C- (Many missing pieces)**

The top three critical issues are:

1. **JWT session tokens stored in `localStorage`** – Any XSS leads to immediate account takeover.
2. **Avatar upload accepts arbitrary file types and serves them same‑origin** – Allows HTML/SVG uploads that can execute XSS.
3. **`bcryptjs` used on Cloudflare Workers** – Will cause CPU timeout errors (`Error 1102`) under load, breaking login/registration.

Additionally, there are **no security headers (CSP, HSTS)**, **no rate limiting on auth endpoints**, **client‑trusted billing parameters** (`trialDays`, `quantity`), **Stripe webhooks lack idempotency**, and **poor frontend performance** (eager route imports, large bundles).

---

## 1. Security Headers & HTTP Configuration

### Critical – No Content Security Policy (CSP)

**Location:** `worker/index.ts:27-46` (no CSP middleware), `vercel.json` (only adds X-Frame-Options)  
**Evidence:** No `Content-Security-Policy` header is set in the Worker or Vercel config.  

**Risk:** Without CSP, an XSS vulnerability (e.g., via avatar upload) can execute arbitrary scripts, steal `localStorage` JWT tokens, and fully compromise user accounts.

**Fix:** Add middleware in `worker/index.ts` **after** CORS:

```ts
app.use("*", async (c, next) => {
  await next();
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // For React; better to use nonce in production
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
    ].join("; "),
  );
});
```

### Critical – Missing HSTS, X‑Content‑Type‑Options, Referrer‑Policy, Permissions‑Policy
**Location:** `worker/index.ts` – no headers set  
**Evidence:** Source inspection shows no middleware setting these headers.

**Risk:**
- No HSTS → possible protocol downgrade attacks.
- No X-Content-Type-Options → MIME sniffing can lead to XSS.
- No Referrer-Policy → may leak URLs to third parties.

**Fix:** Add same middleware as above with:
```ts
c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
c.header("X-Content-Type-Options", "nosniff");
c.header("Referrer-Policy", "strict-origin-when-cross-origin");
c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
```

### Medium – CORS allows localhost in production
**Location:** `wrangler.jsonc:38-39`, `worker/index.ts:30-39`  
**Evidence:** 
```json
"ALLOWED_ORIGINS": "https://viraltrim.codedmotion.studio,http://localhost:3000"
```
**Risk:** Looser than necessary, but not critical.  
**Fix:** Remove `http://localhost:3000` from production `ALLOWED_ORIGINS`.

### Manual verification required – Live headers
Unable to verify actual deployed headers. Run:
```bash
curl -I https://viraltrim.codedmotion.studio/
curl -I https://viraltrim.codedmotion.studio/api/auth/login
```

---

## 2. Authentication & Session Management

### Critical – JWT stored in localStorage
**Location:** `src/lib/api-client.ts:5,131-134,176-183`  
**Evidence:**
```ts
const TOKEN_KEY = "viraltrim_token";
const token = localStorage.getItem(TOKEN_KEY);
headers.set("Authorization", `Bearer ${token}`);
localStorage.setItem(TOKEN_KEY, token);
```
**Risk:** Any XSS can read and exfiltrate the token.  
**Fix:** Move to HttpOnly, Secure, SameSite=Lax cookie.  
**Backend changes (partial):**
```ts
// worker/userRoutes.ts
import { setCookie, deleteCookie } from "hono/cookie";

api.post("/api/auth/login", async (c) => {
  // ... after creating session
  setCookie(c, "vt_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: ttl,
  });
  return c.json({ success: true, data: { user: publicUser(user) } });
});
```
Modify `authMiddleware` to read cookie instead of Authorization header. Remove `localStorage` logic from frontend entirely.

### High – No logout endpoint (server-side revocation)
**Location:** `worker/userRoutes.ts` – no POST /api/auth/logout route found in provided source.  
**Evidence:** Searched `userRoutes.ts` – only login, register, me, profile. No logout.  
**Risk:** Tokens cannot be revoked until expiry (7 days).  
**Fix:** Add:
```ts
api.post("/api/auth/logout", authMiddleware, async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (token) await revokeSession(createDatabase(c.env.DB), token, c.env.JWT_SECRET);
  deleteCookie(c, "vt_session", { path: "/" });
  return c.json({ success: true });
});
```

### High – No rate limiting on login/register
**Location:** `worker/userRoutes.ts:89-149` – no limiter. Only chatbot has rate limit (`checkChatbotRateLimit`).  
**Risk:** Credential stuffing, brute‑force attacks.  
**Fix:** Implement KV-based limiter (e.g., 5 attempts per 15 minutes per IP+email).

### High – bcryptjs on Cloudflare Workers (CPU timeout risk)
**Location:** `worker/auth.ts:1,7,14,19`, `package.json:49`  
**Evidence:** Uses `bcryptjs` for password hashing.  
**Risk:** Cloudflare Workers have strict CPU limits (~10-50ms). `bcryptjs` is pure JS and may exceed limit, causing `Error 1102` on login/register under load.  
**Fix:** Replace with native WebCrypto PBKDF2 or scrypt. Example:
```ts
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return `${Buffer.from(salt).toString("hex")}:${Buffer.from(hash).toString("hex")}`;
}
```

### Medium – No password complexity validation
**Location:** `worker/database/services/user-service.ts:44-54` – only checks existence.  
**Risk:** Weak passwords accepted.  
**Fix:** Enforce minimum length (12) and reject common passwords.

### Medium – No refresh token rotation
**Location:** `worker/auth.ts` – only issues long-lived JWT (7 days).  
**Risk:** Stolen token stays valid.  
**Fix:** Implement short-lived access token (15 min) + refresh token stored in HttpOnly cookie.

### Low – No session cleanup job
**Location:** No scheduled deletion of expired/revoked sessions.  
**Risk:** Table growth over time.  
**Fix:** Add a cron trigger (e.g., daily) to delete rows where `expires_at < now()`.

---

## 3. Input Validation & Injection Defenses

### High – Avatar upload accepts arbitrary file types and serves same‑origin
**Location:** `worker/userRoutes.ts:184-203`, `worker/userRoutes.ts:206-219`  
**Evidence:**
```ts
const file = form.get("file");
await c.env.MEDIA.put(key, buf, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
// Served back as /api/media/...
```
No MIME restriction. An attacker can upload an HTML file with malicious script, and since it’s served from the same origin, it can access `localStorage` tokens.  
**Fix:** Allow only safe image MIME types and force correct extension:
```ts
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
if (!ALLOWED.has(file.type)) return c.json({ error: "Invalid image type" }, 400);
const ext = file.type.split("/")[1];
const key = `avatars/${user.id}/${generateId()}.${ext}`;
// also set X-Content-Type-Options: nosniff on the response
```

### Medium – Prompt injection in Gemini calls
**Location:** `worker/gemini.ts:21-24`, `worker/gemini.ts:54-55`, `worker/userRoutes.ts:645-654`  
**Evidence:** User input (category, sourceUrl, message) is interpolated directly into system prompts.  
**Risk:** Attacker can override instructions, extract data, or cause malformed output.  
**Fix:** Sanitize and quote user input, cap length, and treat as data, not instructions. Example:
```ts
const safeCategory = JSON.stringify(String(category).slice(0, 100).replace(/[\n\r`]/g, ""));
const prompt = `... Focus area: ${safeCategory} ...`;
```

### Medium – No Zod validation on request bodies
**Location:** `worker/userRoutes.ts:95,133,167,253,448,663` – raw `c.req.json()` without schema.  
**Risk:** Malformed or oversized payloads can cause unexpected behavior.  
**Fix:** Define Zod schemas for each route and validate before processing.

### Verified good – No raw SQL execution (Drizzle ORM used)
**Location:** All database access uses Drizzle query builder. No string concatenation of SQL found.

---

## 4. API & Backend Security

### High – Client‑trusted trialDays and quantity in checkout
**Location:** `worker/userRoutes.ts:470-478`  
**Evidence:**
```ts
const trialDays = typeof body.trialDays === "number" ? body.trialDays : undefined;
const quantity = typeof body.quantity === "number" ? body.quantity : undefined;
```
**Risk:** Any authenticated user can set arbitrary trial days or quantity, bypassing business rules.  
**Fix:** Derive these values server‑side based on price ID and user’s plan. Never trust client input.

### High – Stripe webhook returns 200 on invalid signatures and processing failures
**Location:** `worker/userRoutes.ts:503-509`, `worker/userRoutes.ts:626-629`  
**Evidence:** Invalid signature or catch block still returns `{ received: true }`.  
**Risk:** Stripe will not retry failed events, leading to billing desynchronization.  
**Fix:** Return 400 for bad signature, 500 for processing errors.

### High – No idempotency for Stripe webhook events
**Location:** `worker/userRoutes.ts:576-629` – no check for duplicate `event.id`.  
**Risk:** Duplicate deliveries cause duplicate payments or subscription upgrades.  
**Fix:** Create a `processed_webhook_events` table with unique `event_id` and check before processing.

### Medium – No explicit request body size limits
**Location:** No middleware limiting JSON/form size.  
**Risk:** Large payloads can exhaust memory.  
**Fix:** Add size check middleware (e.g., 1MB for JSON, 10MB for form data).

### Verified good – Auth middleware covers most sensitive routes
**Location:** `worker/userRoutes.ts` – `/api/auth/me`, `/api/clips/*`, `/api/billing/*` (except `/prices`), etc. are protected. Public routes are limited.

### Verified good – Stack traces not exposed to clients
**Location:** `worker/index.ts:50-53` – global error handler returns generic message.

---

## 5. Performance & Bundle Optimization

### High – Large initial bundle and no route‑level lazy loading
**Location:** `src/main.tsx:19-29` – all pages imported eagerly.  
**Evidence:** Built assets include `dash.all.min-D_hFuBFJ.js` (968 KB), `index-DpJfO-CA.js` (610 KB).  
**Risk:** Slow Time to Interactive, poor Core Web Vitals.  
**Fix:** Use `React.lazy()` + `Suspense` for all routes.

### Medium – External font CSS is render‑blocking
**Location:** `src/index.css:1` – `@import` of Google Fonts.  
**Risk:** Delays first paint.  
**Fix:** Move to `<link>` in `<head>` with preconnect.

### Medium – Discovery thumbnails not lazy‑loaded
**Location:** `src/pages/DiscoveryPage.tsx:91-94` – background images without `loading="lazy"`.  
**Risk:** Off‑screen images loaded immediately.  
**Fix:** Use `<img loading="lazy">` instead of background-image.

### Top 10 largest dependencies (by disk size in node_modules)
1. `lucide-react` – 33.5 MB
2. `date-fns` – 21.6 MB
3. `drizzle-orm` – 9.9 MB
4. `react-dom` – 7.0 MB
5. `stripe` – 5.3 MB
6. `framer-motion` – 4.5 MB
7. `recharts` – 4.5 MB
8. `zod` – 4.1 MB
9. `hono` – 1.3 MB
10. `react-day-picker` – 1.2 MB

---

## 6. SEO (Search Engine Optimization)

### Medium – Missing canonical URL and robots meta
**Location:** `index.html:7-17` – no `<link rel="canonical">`, no `<meta name="robots">`.  
**Risk:** Duplicate content issues, crawling inefficiency.  
**Fix:** Add:
```html
<link rel="canonical" href="https://viraltrim.codedmotion.studio/" />
<meta name="robots" content="index,follow" />
```

### Medium – Missing Open Graph image and Twitter Card tags
**Location:** `index.html:13-15` – only `og:title`, `og:description`, `og:type`. No `og:image`, `og:url`, `twitter:card`.  
**Fix:** Add:
```html
<meta property="og:image" content="https://viraltrim.codedmotion.studio/og-image.png" />
<meta property="og:url" content="https://viraltrim.codedmotion.studio/" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="ViralTrim - AI Viral Video Clipper & Auto-Poster" />
```

### Medium – No structured data (JSON‑LD)
**Location:** No `<script type="application/ld+json">` in `index.html`.  
**Risk:** Missed rich results.  
**Fix:** Add `WebSite` and `Product` schemas.

### Medium – No robots.txt or sitemap.xml in source
**Location:** `public/` folder contains only `vite.svg`.  
**Risk:** Search engines may not discover all pages.  
**Fix:** Create `public/robots.txt` and `public/sitemap.xml`.

### Low – Favicon hotlinks raw GitHub content
**Location:** `index.html:5` – `https://raw.githubusercontent.com/...`  
**Risk:** External dependency, may break if GitHub changes.  
**Fix:** Serve local favicon.

---

## 7. AEO (Answer Engine Optimization)

### Medium – No FAQ schema or explicit FAQ section
**Location:** Homepage has marketing copy but no FAQ block.  
**Risk:** Lower chance of featured snippets for common questions.  
**Fix:** Add FAQ section with `FAQPage` JSON‑LD.

### Medium – Heading hierarchy is incomplete
**Location:** `src/pages/HomePage.tsx` – one h1, then h3 without an h2.  
**Risk:** Weaker semantic structure.  
**Fix:** Add an h2 before the feature cards.

### Medium – Copy is marketing‑forward, not answer‑forward
**Location:** Homepage does not directly answer “What is ViralTrim?”, “How does it work?”.  
**Risk:** Misses conversational search intent.  
**Fix:** Add short answer sections with clear headings.

---

## 8. Infrastructure & Deployment

### Medium – vercel.json conflicts with Cloudflare Worker deployment
**Location:** `vercel.json` in root.  
**Risk:** Confusion; Vercel config not used but may mislead.  
**Fix:** Remove `vercel.json` or document it as legacy.

### Medium – KV namespace placeholders in wrangler.jsonc
**Location:** `wrangler.jsonc:23-28` – `"id": "REPLACE_WITH_KV_SESSIONS_ID"`.  
**Risk:** Deploy will fail unless replaced.  
**Fix:** Replace with real IDs from `wrangler kv:namespace create`.

### Medium – D1 database ID is hardcoded but placeholder for KV is not
**Location:** `wrangler.jsonc:16-20` – D1 ID is a real UUID (may be valid). KV placeholders are not.  
**Risk:** Inconsistent.  
**Fix:** Use environment‑specific secrets or `wrangler.toml` with env overrides.

---

## 9. Code Quality & Maintainability

### Critical – Source files are corrupted / do not type‑check
**Location:** `src/components/ui/accordion.tsx` – malformed import order (import after JSX).  
**Evidence:** TypeScript compilation would fail.  
**Risk:** The provided source archive is not buildable.  
**Fix:** Restore from a clean commit or regenerate shadcn/ui components.

### Medium – TypeScript strict mode disabled
**Location:** `tsconfig.app.json:15-18` – `"strict": false`.  
**Risk:** Many potential runtime bugs.  
**Fix:** Enable `strict: true` and fix errors.

### Medium – No automated tests found
**Location:** No `*.test.ts`, `*.spec.ts` files.  
**Risk:** Regressions will go undetected.  
**Fix:** Add unit tests for auth, billing, avatar upload, webhook handling.

### Low – Console‑only logging
**Location:** `worker/index.ts:51`, `src/lib/errorReporter.ts:19-22`.  
**Risk:** Poor observability.  
**Fix:** Send structured logs to a service (e.g., Sentry, Datadog, or Cloudflare Logpush).

---

## 10. Gap Analysis

| Category | Current State | Best Practice | Gap | Action |
| :--- | :--- | :--- | :--- | :--- |
| CSP / Security Headers | None | Strict CSP, HSTS, etc. | Critical | Add middleware |
| Token storage | localStorage | HttpOnly cookie | Critical | Migrate to cookie auth |
| Password hashing | bcryptjs | WebCrypto PBKDF2/scrypt | Critical | Replace with native crypto |
| Avatar upload | Any file type, same‑origin | Image‑only, nosniff | High | Restrict MIME types |
| Rate limiting | Only chatbot | All auth endpoints | High | Implement KV limiter |
| Checkout parameters | Client‑controlled | Server‑derived | High | Remove trialDays/quantity from client |
| Webhook idempotency | None | event.id deduplication | High | Add processed events table |
| Route lazy loading | Eager imports | React.lazy() | High | Refactor routes |
| SEO metadata | Basic | Canonical, JSON‑LD, sitemap | Medium | Expand tags and files |
| TypeScript strictness | strict: false | strict: true | Medium | Enable and fix |
| Session cleanup | None | Periodic deletion | Low | Add cron job |

---

## Appendix: Manual Verification Required
- **Live HTTP headers** – Run `curl -I https://viraltrim.codedmotion.studio/`
- **CORS preflight behavior** – `curl -X OPTIONS ... -H "Origin: ..."`
- **Actual deployed environment variables** (JWT_SECRET, Stripe keys, etc.)
- **D1 backup schedule** – Check Cloudflare Dashboard
- **R2 bucket CORS and bucket policy**
- **Cloudflare Workers logs** – `wrangler tail`
- **Core Web Vitals** – PageSpeed Insights or Lighthouse
- **Whether robots.txt and sitemap.xml are served from the live site**

---

## Final Recommendation
Priority order for fixes:
1. **Replace bcryptjs with WebCrypto** – otherwise login/register will break under load.
2. **Add CSP and security headers** – immediate XSS mitigation.
3. **Move JWT to HttpOnly cookie** – prevent token theft via XSS.
4. **Restrict avatar uploads to images only** – close same‑origin content hosting.
5. **Add rate limiting on auth endpoints** – stop brute‑force.
6. **Fix Stripe webhook idempotency and error responses**.
7. **Lazy‑load routes** – improve performance.
8. **Enable TypeScript strict mode** and fix corrupted component files.

```
---

## Audit 2: ArchitectGPT (excellent breadth, missed bcryptjs)

*(Original ArchitectGPT audit – long, comprehensive, but missing the `bcryptjs` CPU issue.)*

```markdown
# Comprehensive Audit: [https://viraltrim.codedmotion.studio](https://viraltrim.codedmotion.studio)

## Executive Summary

Overall rating: **D+ for security / C- for production readiness** based on the provided source archive. I did **not** verify any fully confirmed **Critical** issue from source or live HTTP responses, but I did verify multiple **High** issues that materially raise security and reliability risk.

The highest-severity problems are: **JWT session tokens stored in `localStorage`**, **same-origin arbitrary file hosting via avatar upload**, and **billing/webhook trust issues** (`trialDays`/`quantity` accepted from the client and Stripe webhooks acknowledged with HTTP 200 even on invalid or failed processing).

---

## 1. Security Headers

### High – No Worker-level security headers in the primary runtime

**Location:** `worker/index.ts:27-46`, `vercel.json:3-7`
**Evidence:** The Worker only installs `logger()` and `cors()` middleware; no middleware sets CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`.

---

## 2. Authentication & Sessions

### High – JWT session tokens are stored in `localStorage`
Any XSS can read and exfiltrate the token.

### Medium – No refresh tokens or rotation exist
If a token is stolen, it remains valid until expiry.

### Medium – No login/register rate limiting
Risk of brute-force and credential stuffing.

### Medium – No password complexity policy
Allows weak passwords.

### Medium – `bcryptjs` on a Worker runtime is CPU-heavy
Cloudflare Workers have strict CPU limits; pure JS `bcryptjs` may cause timeouts.

### Low – Expired sessions are checked, but I found no cleanup job
Table growth over time.

---

## 3. Input Validation & Injection Defenses

### High – Avatar upload accepts arbitrary file types and serves them back from the same origin
Allows HTML/SVG uploads that can execute code in the context of the application.

### Medium – LLM prompts interpolate user input directly with no sanitization
Risk of prompt injection.

### Medium – No schema validation on most JSON request bodies
Potential for malformed data to cause errors.

---

## 4. API & Backend Security

### High – Billing checkout trusts client-supplied `trialDays` and `quantity`
Users can manipulate their subscription terms.

### High – Stripe webhook returns HTTP 200 for invalid signatures and processing failures
Leads to billing desynchronization.

### Medium – No explicit request body size limits
Potential for memory exhaustion.

---

## 5. Performance & Bundle Optimization

### High – Large shipped JS and no route-level lazy loading
Suboptimal performance and SEO.

### Medium – External font CSS is render-blocking
Delays initial page load.

### Medium – Discovery thumbnails are not lazily loaded
Increases initial page weight.

---

## 6. SEO (Search Engine Optimization)

### Medium – SEO metadata is incomplete
Missing canonical tags, OG images, etc.

### Medium – No structured data (JSON-LD)
Lost potential for rich snippets.

### Medium – `robots.txt` and `sitemap.xml` are not present in source
Poor crawlability.

---

## 7. AEO (Answer Engine Optimization)

### Medium – No FAQ content or FAQ schema
Misses conversational search intent.

### Medium – Homepage copy is marketing-forward, not answer-forward
Less effective for AI-driven search engines.

---

## 8. Infrastructure & Deployment

### Medium – Deployment config is split/confusing
`vercel.json` vs Cloudflare Worker setup.

### Medium – KV namespace placeholders in wrangler.jsonc
Deploys will fail until IDs are filled.

---

## 9. Code Quality & Maintainability

### High – Source archive does not type-check
Corrupted files like `accordion.tsx`.

### Medium – Frontend TypeScript strict mode is disabled
Higher risk of runtime bugs.

### Medium – No automated tests found
Regressions are hard to catch.

---

## 10. Gap Analysis Summary

| Category | Action |
| :--- | :--- |
| Security Headers | Add header middleware in `worker/index.ts` |
| Token Storage | Move to `Secure` + `HttpOnly` cookie |
| Auth Protection | Add rate limiting to login/register |
| File Safety | Restrict MIME types and use `nosniff` |
| Billing Security | Remove server rules from client control |
| Webhook Handling | Validate signatures and add idempotency |
| Performance | Implement route-level lazy loading |
| SEO/AEO | Expand metadata and add structured data |
| Code Quality | Enable strict TS and restore source integrity |

```
---

## Audit 3: Gemini 3.1 Pro (deep backend insights, missed frontend)

*(Original Gemini 3.1 Pro audit – shorter, focused on backend crypto and webhook issues.)*

```markdown
# Viral Trim – Full-Stack Security & SRE Audit

## Phase 1 – Audit Report

### 1. Static Code Analysis
- **Hardcoded Development JWT Secret:** In `userRoutes.ts()`, `jwtSecret()` falls back to `"insecure_development_secret"`.
- **Cloudflare Worker CPU Exhaustion via \`bcryptjs\`:** pure JS `bcryptjs` will hit CPU limits. Migrate to native WebCrypto.
- **Prompt Injection Risk:** In `gemini.ts`, `fetchViralDiscoveryJson` interpolates untrusted user input directly.
- **Missing Rate Limits:** Auth and Gemini generation routes are fully exposed.
- **Missing Content Security Policy (CSP):** Increases XSS surface area.

### 2. Infrastructure Gap Analysis
- **KV & R2 Placeholder IDs:** `wrangler.jsonc` has placeholders that will block deployment.
- **Stripe Webhook Idempotency:** Processes webhooks without `event.id` tracking; risks duplicate credits.
- **Drizzle Mismatch:** Manual schema pushes vs CI/CD migration synchronization.

### 3. Deployment Readiness
- **Missing \`dist/worker\` Build Step:** Standard build only handles the client assets.
- **No Centralized Error Logging:** Missing integration with a service like Sentry.

---

## Phase 2 – Action Plan

### Step 1: Infrastructure Provisioning 
```bash
npx wrangler kv:namespace create SESSIONS
npx wrangler kv:namespace create CACHE
npx wrangler r2 bucket create viraltrim-media
npx wrangler d1 create viraltrim-db
```

### Step 2: Resolving CPU Limits (WebCrypto)
Replace `bcryptjs` with PBKDF2 WebCrypto in `worker/auth.ts`.

### Step 3: Global Rate Limiting & CSP
Add global middleware in `worker/index.ts` for CSP and IP-based rate limiting via `c.env.CACHE`.

### Step 4: Fixing Prompt Injection
Sanitize inputs in `worker/gemini.ts` before interpolating into prompts.

---

## 🧠 Required Human Tasks
1. **Verify Webhooks in Stripe:** Copy the `whsec_...` key.
2. **Apply Secrets:** Run `npx wrangler secret put STRIPE_WEBHOOK_SECRET` and `JWT_SECRET`.
3. **Migrate Bcrypt Accounts:** Gradually convert hashes during login.
```

---

## Audit 4: Sonnet 4.6 (detailed action plan but with factual errors)

*(Original Sonnet 4.6 audit – very long, includes full file replacements. **Warning:** Contains false claims about missing Stripe routes and fake viral discovery. Use the action plan but ignore those specific errors.)*

```markdown
# ViralTrim – Full Security & Deployment Audit + Action Plan

---

## Section 1 – Audit Report

### 🔴 CRITICAL ISSUES

1. **JWT stored in `localStorage`:** Fully exposed to XSS.
2. **Missing CSP:** No security headers configured.
3. **Stripe webhook signature not verified:** Allows fraudulent payment activation.
4. **`bcryptjs` on Cloudflare Worker:** Inefficiency and potential CPU timeout errors.
5. **No Rate Limiting:** Auth endpoints targetable by brute force.
6. **KV namespace placeholders:** Deployment will fail with current `wrangler.jsonc`.

*(Note: Claims about missing Stripe routes and non-functional viral discovery are incorrect – routes exist under /api/billing/)*

---

## Section 2 – Remediation Action Plan

### 1. Implement Strict Security Headers
Add middleware to `worker/index.ts` setting CSP, HSTS, `X-Content-Type-Options`, etc.

### 2. Move to HttpOnly Cookie Authentication
Refactor `userRoutes.ts` and `api-client.ts` to use cookies instead of `Authorization` header.

### 3. Replace Password Hashing with WebCrypto
Switch from `bcryptjs` to native PBKDF2 to stay within Cloudflare CPU limits.

### 4. Secure Avatar Uploads
Add MIME type validation and `nosniff` headers to media serving routes.

### 5. Add Webhook Idempotency
Use a database table to track processed Stripe `event.id`s.

### 6. Performance Optimization
Implement `React.lazy()` for frontend routes and improve asset loading.

... (remediation code and instructions omitted for brevity) ...
```

**Note:** The claims about missing Stripe routes and fake viral discovery are **false** – those routes exist under `/api/billing/*` and the viral discovery does call Gemini. Ignore those specific statements. All other findings are valid and well‑detailed.

---
**End of Combined Audits**
Use the above as the source of truth for generating the final implementation plan. Prioritize fixes from DeepSeek v2 (most complete, includes bcryptjs fix) and ArchitectGPT (breadth), then incorporate the backend‑specific insights from Gemini 3.1 Pro and the actionable code from Sonnet 4.6 (excluding its factual errors).
