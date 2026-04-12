Viraltrim — Full Production Build Specification
Product Vision
viraltrim is a production-grade AI-powered SaaS platform that discovers viral videos across the internet, intelligently clips them into platform-optimized short-form content (TikTok 9:16, Instagram Reels, YouTube Shorts), generates AI captions and thumbnails, and auto-schedules posting across connected social media accounts. The platform operates as a Single-Page Application (SPA) with a dual-layout strategy: a public cinematic marketing site and a protected authenticated application shell.
The company behind this is Coded Motion Studio (codedmotion.studio) — a web agency known for cinematic, 3D motion-heavy single page applications. This site must reflect that brand identity. It must look like nothing else in the SaaS space — not a shadcn template, not a Vercel-clone. It should feel like entering a film production studio.
---
Technology Stack
Frontend
React 19 with concurrent features enabled
Vite 6 as the build tool
React Router v6 with createBrowserRouter and data loaders
Framer Motion for all page transitions and micro-interactions
GSAP with ScrollTrigger plugin for scroll-driven animations
Three.js for the 3D animated mesh hero section
Tailwind CSS with shadcn/ui component library
Semantic tokens only: bg-background, text-foreground, bg-card, border-border — never raw Tailwind color classes
Fonts: Clash Display (display headings) + Syne (body text) loaded via CDN (not Inter, not Roboto)
lucide-react for all icons
date-fns for date formatting
react-dropzone for video upload zones
react-player for video preview
Backend
Supabase: PostgreSQL database, Supabase Auth (email/password + OAuth), Row Level Security on every table, Edge Functions (Deno) for all server-side logic, Supabase Storage for video files and thumbnails
All database queries go through the Supabase JS client using the anon key on the frontend, with RLS enforcing access
All sensitive operations (AI calls, Stripe operations, email sending) run inside Supabase Edge Functions using the service role key — never expose service role or API keys to the client
AI
Gemini 1.5 Flash via Google Generative AI SDK — used for: viral score analysis, caption generation, thumbnail description, chatbot support responses, trending video discovery
Gemini 1.5 Pro — reserved only for thumbnail image analysis when a user uploads a custom image (cost-controlled, called sparingly)
No OpenAI. No Anthropic API. Gemini only.
All Gemini calls are made exclusively from Supabase Edge Functions — the GEMINI_API_KEY is never sent to the browser
Payments
Stripe for subscription billing with three tiers
Stripe Customer Portal for self-service plan management
Stripe Webhooks handled in a Supabase Edge Function — all events upsert, never throw on duplicate delivery
Stripe Connect for affiliate commission payouts
Email
Resend for all transactional email: welcome email on signup, DMCA takedown notification to admin, DMCA acknowledgement to reporter, password reset, billing receipts
Hosting
Vercel for frontend deployment
Supabase for all backend services
Custom domain via Spaceship registrar with Vercel nameservers
---
Visual Design System (non-negotiable — execute at the highest level)
Aesthetic Direction
Cinematic dark-mode application. Design language: premium, motion-forward, slightly futuristic — like a film VFX studio's internal tool made public. Reference aesthetic: Apple ProRes meets A24 film color grading. Every section should feel intentional, like frames in a film reel. No generic SaaS styling. No purple-gradient-on-gray-card clichés.
Color Palette
Primary background: `#09090b` (near-black)
Sky Blue accent: `#0ea5e9`
Violet accent: `#8b5cf6`
Card surfaces: `#111113`
Borders: `rgba(255,255,255,0.07)` — extremely subtle
Gradient primary: linear-gradient from `#0ea5e9` to `#8b5cf6`
Text primary: `#fafafa`, Text muted: `#71717a`
Typography
Clash Display: hero headlines, section titles, pricing numbers
Syne: body text, navigation, captions, UI labels
Load both from Fontshare CDN: `https://api.fontshare.com/v2/css?f\\\[]=clash-display@700,600\\\&f\\\[]=syne@400,500,600\\\&display=swap`
3D Hero Section (Three.js — full implementation)
Build a full Three.js WebGL scene as the landing page hero background:
Animated wireframe mesh torus knot that slowly rotates and reacts to mouse movement using parallax on mousemove
WebGL particle field behind the mesh — 2000+ small points drifting in a slow current
Mesh material color lerps between `#0ea5e9` and `#8b5cf6` using a custom ShaderMaterial or animated MeshBasicMaterial
Canvas fills full viewport, z-index below hero content, pointer-events none
Responsive: ResizeObserver updates camera aspect and renderer size
Performance: requestAnimationFrame with clock.getDelta(), geometry and renderer disposed on unmount, pixel ratio capped at 2
Scroll Animations (GSAP ScrollTrigger)
Every major landing page section animates in on scroll:
Feature bento grid cards: stagger in from Y+40 with opacity 0→1, 0.1s stagger between cards
Pricing cards: scale from 0.93 with opacity fade, centered card animates first
Stats bar: numbers count up from 0 to target value when section enters viewport using GSAP CountTo
How It Works timeline: SVG line draws from top to bottom as user scrolls through the 3 steps, each step icon pops in at the correct scroll position
Framer Motion
Route transitions: AnimatePresence wrapping outlet, each page fades + translates Y by 10px on enter/exit
Modal entrances: spring scale from 0.95 with opacity
Button hover: scale 1.02, subtle glow box-shadow using the gradient accent color at 40% opacity
Dashboard card hover: translateY -2px, box-shadow lift
---
Application Views — Complete Specifications
1. Landing Page (public, `/`)
Sections in exact order:
Navigation: sticky top, backdrop-blur-md on scroll, logo left (Clash Display wordmark "viraltrim"), nav links center (Features, Pricing, Affiliate, Legal), "Get Started Free" CTA right with gradient border and hover glow
Hero: full-viewport Three.js canvas background. Overlay content centered: badge chip "AI-Powered Viral Clipping", H1 headline in Clash Display "Turn Any Video Into Viral Content", subheadline in Syne "Discover trending videos, clip them in seconds, and auto-post to every platform.", two CTAs side by side: "Start For Free" (gradient background) and "Watch Demo" (ghost with border). Animated mouse-scroll indicator at bottom. No fake video previews — use a styled terminal/code-block mockup showing the AI clip generation output as animated text.
Social Proof Bar: animated horizontal scrolling ticker of platform names (TikTok, Instagram, YouTube Shorts, Facebook Reels, Twitter/X, LinkedIn) with their icons from lucide-react or simple SVG. Below: three stat counters that count up on scroll: "10K+ Clips Generated", "99% Uptime", "5 Platforms Supported" — these are honest numbers, do not fabricate user counts.
How It Works: 3-step section with GSAP-drawn connecting line. Step 1: Discover (paste a URL or browse AI-curated viral feed). Step 2: Auto-Clip (AI identifies the best moments, generates 9:16, 4:5, 16:9 versions). Step 3: Schedule & Post (approve captions, pick platforms, set time, done).
Feature Bento Grid: 6 cards in a CSS grid bento layout (2 large + 4 small). Cards: AI Viral Discovery, Auto-Clipping Engine, Smart Caption Generator, AI Thumbnail Picker, Multi-Platform Scheduler, Built-In Affiliate Program. Each card has an icon, title, one-line description, and a subtle gradient border on hover.
Pricing Section: monthly/annual toggle (annual = 2 months free, show savings badge). Three cards: Free ($0), Pro ($29/mo or $290/yr), Agency ($99/mo or $990/yr). Feature checklist per tier. "Most Popular" badge on Pro. Primary gradient button on each. Annual pricing shows strikethrough monthly price.
FAQ Accordion: 8 questions: How does the AI clipping work? Is this legal to use? What platforms can I post to? How long can clips be? Can I use my own videos? What happens if I hit my clip limit? How does the affiliate program work? How do I cancel?
Footer: four columns: Product (Features, Pricing, Affiliate, Changelog), Legal (Terms of Service, Privacy Policy, DMCA Policy), Company (About, Contact, codedmotion.studio), Support (Help Center, Report Infringement, Status). Bottom bar: copyright line, "DMCA Agent: [Name] — dmca@viraltrim.com", "Report Copyright Infringement" link.
2. Auth Pages (`/login`, `/signup`)
Centered card, dark glassmorphism background with subtle gradient border glow.
Sign Up fields: Full Name, Email, Password (with strength indicator), Confirm Password.
Legal agreement (mandatory): Checkbox — "I have read and agree to the Terms of Service and Privacy Policy" — hyperlinked. Submit button disabled until checked. On signup success, insert into `tos\\\_agreements`: `{ user\\\_id, agreed\\\_at: NOW(), ip\\\_address, tos\\\_version: "1.0" }`. IP address retrieved server-side in the Edge Function or Supabase Auth hook.
Login fields: Email, Password, "Forgot Password" link (triggers Resend password reset email).
OAuth: "Continue with Google" using Supabase Google OAuth provider.
Post-auth redirect: `/dashboard`.
3. Dashboard (`/dashboard`)
Layout: fixed AppSidebar left (240px) + main content.
AppSidebar: viraltrim logo top, nav items with icons (Dashboard, Editor Studio, Schedule, Settings, Affiliate), free space, user avatar + first name + plan badge, "Upgrade" CTA if on Free plan.
Main content:
Welcome header: "Good morning, [first name]" + plan badge
Stats row (4 cards): Clips This Month, Quota Remaining (animated progress bar), Scheduled Posts, Connected Platforms
Viral Discovery Feed: heading "Trending Now" with "Powered by Gemini AI" badge. Grid of video cards. Each card: thumbnail (from YouTube oEmbed or meta), title, channel name, view count formatted (e.g. "2.4M views"), viral score badge (colored 0-100), platform tags, "Auto-Clip" button. Data fetched by calling the `viral-discovery` Edge Function on page load with a loading skeleton state.
Recent Projects: table with columns — Project Name, Source, Clips Generated, Status badge, Created date, Actions (Open / Delete)
Quick Actions row: three icon buttons — Upload My Video, Browse Discovery, View Schedule
4. Editor Studio (`/editor/:projectId`)
Three-panel layout:
Left Panel (Clip List):
Project title at top
Clip cards list — each shows: thumbnail, clip number, duration (e.g. "0:42"), viral score, recommended platform badge, status (Draft/Approved)
"Generate More Clips" button (disabled + shows upgrade tooltip if Free user at quota)
Center Stage (Video Preview):
react-player video player with custom controls
Below player: trim timeline bar with draggable start handle (blue) and end handle (violet). Duration display updates live. Max 90 seconds enforced — handles cannot exceed this range. A red warning badge appears if user tries to exceed 90s.
Playback controls: play/pause, current time, total duration
Platform preview toggle tabs: TikTok (9:16), Reels (4:5), Shorts (16:9) — each tab shows the clip framed in the correct aspect ratio with a phone/device mockup outline
"Suggest Better Clip" button — calls `generate-clip` Edge Function with the video URL and receives a new suggested start/end time range from Gemini
Right Panel (Caption & Publishing):
Section: "AI Caption"
Editable textarea pre-filled with Gemini-generated caption
Below textarea (read-only, styled differently): "Original video by [source_channel]" — labeled "Required credit — cannot be removed"
Character count display (TikTok max 2200, shown per platform)
Section: "Hashtags"
Tag input showing 5 AI-suggested hashtags as removable chips, user can add/remove
Section: "Thumbnail"
Default: best AI-selected frame shown as preview image
"Scrub to Pick Frame" — a small timeline scrubber that updates the preview on drag
"Generate AI Description" — calls Gemini to describe the thumbnail for alt text
Section: "Publish To"
Checkbox list: TikTok, Instagram Reels, YouTube Shorts, Facebook Reels, Twitter/X
Connected account status shown per platform (green dot = connected, orange = not connected with "Connect" link)
Bottom: "Approve & Schedule" primary gradient button → opens scheduling modal (date/time picker)
Quota Exceeded Modal (when Free user hits 3 clips):
Full-screen overlay with backdrop blur, centered card. Headline: "You've Used Your Free Clips". Shows the pricing table component. Primary CTA: "Upgrade to Pro" → Stripe Checkout. Secondary: "Maybe Later" dismisses modal. This modal must be beautiful — not a browser alert.
5. Schedule & Distribution (`/schedule`)
Top: monthly calendar (custom-built or using a headless calendar lib — no FullCalendar, build it with date-fns). Scheduled posts appear as small colored chips on their day, color-coded by platform.
Below: list view table — Thumbnail, Clip Title, Platforms (icon badges), Scheduled For (formatted date/time), Status badge (Pending/Posted/Failed), Edit and Delete action buttons.
"Schedule New Post" button (floating or top-right) opens a modal to pick a clip from existing approved clips and set a date/time.
Right sidebar: "Connected Platforms" panel showing each platform with connection status badge. Social API posting is real UI but posting itself is documented as requiring platform API approval — display a "Platform API Pending Approval" status badge for each with instructions in a tooltip.
6. Settings & Billing (`/settings`)
Tabbed layout: Profile / Social Accounts / Billing / Danger Zone.
Profile tab: Full Name input, Email (read-only with "Change Email" flow), Avatar upload (drag-and-drop to Supabase Storage, previews immediately after upload), Save button.
Social Accounts tab: Card per platform (TikTok, Instagram, YouTube, Facebook, Twitter/X). Each card: platform logo, "Connected as @handle" or "Not Connected", Connect/Disconnect button. OAuth flow for each platform (Supabase OAuth or direct OAuth redirect — implement the redirect flow completely even if posting is pending API approval).
Billing tab: Current plan name + badge, next billing date, "Manage Subscription" button opens Stripe Customer Portal in new tab. Invoice table: date, amount, status, PDF link (from Stripe API via Edge Function). "Cancel Plan" link inside the Stripe portal.
Danger Zone tab: "Delete My Account" button with red border. Click shows confirmation dialog: "Type DELETE to confirm". On confirm, calls Edge Function that: cancels Stripe subscription, deletes all user storage files, deletes all user DB records (cascade handles most), and signs user out.
7. Affiliate Dashboard (`/affiliate`)
Accessible to Pro and Agency users only. Free users see a locked state with upgrade prompt.
Referral link display: full URL in a styled input with one-click copy button and a "Share" button with dropdown (Copy Link, Share on Twitter, Share on LinkedIn)
Stats cards row: Total Clicks, Total Conversions, Active Referrals, Lifetime Earnings, Pending Payout
Commission explanation: "Earn 30% recurring commission on every paying referral, for as long as they stay subscribed."
Referral table: Date, Referred Email (partially masked — show first 2 chars + *** + domain), Plan, Monthly Commission, Status (Pending / Paid)
Payout history table: Date, Amount, Stripe Transfer ID
"Request Payout" button (enabled when pending balance ≥ $50). Stripe Connect onboarding prompt if Connect account not yet set up.
8. Support Chatbot Widget (all pages)
Floating button bottom-right, 56px circle, gradient background, animated pulse ring, "?" icon or robot icon from lucide-react
Click toggles a slide-up panel (360px wide, 500px tall) anchored to bottom-right corner
Chat panel header: "Forge — viraltrim Assistant", close button
Message thread with user bubbles (right, gradient) and bot bubbles (left, card surface)
Input field at bottom with send button
On send: call `chatbot` Supabase Edge Function with `{ message, history: \\\[...previousMessages] }`. Show typing indicator (three animated dots) while waiting. Display Gemini response.
Chatbot system prompt includes: full app feature descriptions, how clipping works, billing FAQ, DMCA process explanation, affiliate program details, common error troubleshooting, platform connection instructions
Escalation: "Talk to a Human" button at panel bottom opens an email form (Name, Email, Message) that calls the `dmca-report`-style Edge Function to send a support email via Resend
Bot opening message: "Hey! I'm Forge, your viraltrim assistant. Ask me anything about the platform — clipping, billing, copyright, or getting started."
9. Legal Pages (`/terms`, `/privacy`, `/copyright`)
All three pages must contain complete, enforceable legal text — not placeholder content. Write the full text.
Terms of Service must include: acceptance of terms, description of service, user eligibility (13+), account registration, user content ownership warranty (users represent and warrant they own or have all necessary rights to content processed), prohibited uses (mass downloading, redistribution of third-party copyrighted content without rights, circumventing platform ToS), platform as tool disclaimer (viraltrim is a technical tool and does not provide copyright clearance, legal advice, or guarantee of fair use), clip length policy (90-second maximum), DMCA and repeat infringer policy (three upheld DMCA strikes result in permanent account termination), subscription terms and auto-renewal disclosure, cancellation and refund policy (no refunds on current billing period), limitation of liability, indemnification, governing law (include [State] placeholder for owner to fill), dispute resolution, changes to terms.
Privacy Policy must include: data controller identity, what data is collected (name, email, IP at ToS acceptance, usage data, payment data via Stripe — we never store full card numbers), how data is used, third-party data processors listed explicitly (Supabase, Stripe, Resend, Google/Gemini, Vercel), GDPR rights for EU users (access, rectification, erasure, portability, restriction, objection — with contact email for requests), CCPA rights for California users (right to know, right to delete, right to opt-out of sale — state that we do not sell personal data), cookie policy (only essential auth session cookie — no tracking or advertising cookies), data retention policy (account data deleted within 30 days of deletion request), security measures, contact information, policy update notification process.
DMCA / Copyright Policy must include: statement of Safe Harbor compliance under 17 U.S.C. § 512(c), designated copyright agent name and contact (use placeholder [DMCA Agent Name] and dmca@viraltrim.com), all six elements required for a valid DMCA takedown notice, how to submit a takedown (link to /dmca-report form), response timeline (we respond within 5 business days), counter-notification process and its legal requirements, repeat infringer termination policy, disclaimer that viraltrim is a neutral platform and does not pre-screen content.
---
Legal Compliance — Code Implementation
ToS agreement checkbox on signup: required field, submit button disabled without it. On signup, Edge Function or Supabase Auth hook inserts `tos\\\_agreements` record with user_id, timestamp, IP, version "1.0".
Footer on every page: "Report Copyright Infringement" link pointing to `/dmca-report`
DMCA Report page (`/dmca-report`): public page (no auth required). Form fields: Your Name, Your Email, Original Work URL, Infringing Content URL, Description of Work, Good Faith Statement (checkbox: "I have a good faith belief that use of the material is not authorized"), Accuracy Statement (checkbox: "I declare under penalty of perjury that the information is accurate"), Electronic Signature (text input). On submit: insert to `dmca\\\_reports` table + send two Resend emails: (1) admin notification with full report details, (2) acknowledgement to reporter confirming receipt and 5-business-day response timeline.
After admin updates a `dmca\\\_reports` record status to "upheld", a Supabase database trigger calls the `enforce-dmca-strikes` Edge Function. This function counts upheld strikes for the reported user_id. If count ≥ 3: set `users.is\\\_banned = true`, call Stripe API to cancel their active subscription, send Resend email to user notifying of termination.
Every AI-generated caption from `generate-clip` Edge Function appends "\n\nOriginal video by [source_channel_name]" to the caption string before saving. The frontend renders this as a separate read-only styled block below the editable caption textarea.
Clip duration validation in `generate-clip` Edge Function: `if (duration > 90) { return new Response(JSON.stringify({ error: 'Clip exceeds 90 second maximum' }), { status: 400 }) }`
---
Supabase Database Schema (complete SQL — ready to run)
```sql
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full\\\_name text,
  avatar\\\_url text,
  plan text default 'free' check (plan in ('free', 'pro', 'agency')),
  clips\\\_used\\\_this\\\_month integer default 0,
  is\\\_banned boolean default false,
  stripe\\\_customer\\\_id text,
  created\\\_at timestamptz default now()
);
alter table public.users enable row level security;
create policy "Users can view own record" on public.users for select using (auth.uid() = id);
create policy "Users can update own record" on public.users for update using (auth.uid() = id);

create table public.tos\\\_agreements (
  id uuid primary key default gen\\\_random\\\_uuid(),
  user\\\_id uuid references public.users(id) on delete cascade,
  agreed\\\_at timestamptz default now(),
  ip\\\_address text,
  tos\\\_version text default '1.0'
);
alter table public.tos\\\_agreements enable row level security;
create policy "Users can insert own agreement" on public.tos\\\_agreements for insert with check (auth.uid() = user\\\_id);

create table public.subscriptions (
  id uuid primary key default gen\\\_random\\\_uuid(),
  user\\\_id uuid references public.users(id) on delete cascade,
  stripe\\\_subscription\\\_id text unique,
  stripe\\\_price\\\_id text,
  status text,
  current\\\_period\\\_end timestamptz,
  updated\\\_at timestamptz default now()
);
alter table public.subscriptions enable row level security;
create policy "Users can view own subscription" on public.subscriptions for select using (auth.uid() = user\\\_id);

create table public.projects (
  id uuid primary key default gen\\\_random\\\_uuid(),
  user\\\_id uuid references public.users(id) on delete cascade,
  title text,
  source\\\_url text,
  source\\\_channel text,
  status text default 'processing' check (status in ('processing', 'ready', 'failed')),
  created\\\_at timestamptz default now()
);
alter table public.projects enable row level security;
create policy "Users CRUD own projects" on public.projects for all using (auth.uid() = user\\\_id);

create table public.clips (
  id uuid primary key default gen\\\_random\\\_uuid(),
  project\\\_id uuid references public.projects(id) on delete cascade,
  user\\\_id uuid references public.users(id) on delete cascade,
  storage\\\_path text,
  thumbnail\\\_path text,
  duration\\\_seconds numeric check (duration\\\_seconds <= 90),
  caption text,
  required\\\_credit text,
  hashtags text\\\[],
  platform\\\_targets text\\\[],
  viral\\\_score integer check (viral\\\_score between 0 and 100),
  status text default 'draft' check (status in ('draft', 'approved', 'scheduled', 'posted')),
  created\\\_at timestamptz default now()
);
alter table public.clips enable row level security;
create policy "Users CRUD own clips" on public.clips for all using (auth.uid() = user\\\_id);

create table public.social\\\_accounts (
  id uuid primary key default gen\\\_random\\\_uuid(),
  user\\\_id uuid references public.users(id) on delete cascade,
  platform text check (platform in ('tiktok', 'instagram', 'youtube', 'facebook', 'twitter')),
  account\\\_handle text,
  access\\\_token text,
  refresh\\\_token text,
  connected\\\_at timestamptz default now(),
  unique(user\\\_id, platform)
);
alter table public.social\\\_accounts enable row level security;
create policy "Users CRUD own social accounts" on public.social\\\_accounts for all using (auth.uid() = user\\\_id);

create table public.scheduled\\\_posts (
  id uuid primary key default gen\\\_random\\\_uuid(),
  user\\\_id uuid references public.users(id) on delete cascade,
  clip\\\_id uuid references public.clips(id) on delete cascade,
  platform text,
  scheduled\\\_for timestamptz,
  status text default 'pending' check (status in ('pending', 'posted', 'failed')),
  posted\\\_at timestamptz
);
alter table public.scheduled\\\_posts enable row level security;
create policy "Users CRUD own scheduled posts" on public.scheduled\\\_posts for all using (auth.uid() = user\\\_id);

create table public.dmca\\\_reports (
  id uuid primary key default gen\\\_random\\\_uuid(),
  reporter\\\_name text not null,
  reporter\\\_email text not null,
  original\\\_work\\\_url text not null,
  infringing\\\_url text not null,
  reported\\\_user\\\_id uuid references public.users(id),
  description text,
  good\\\_faith\\\_statement boolean default false,
  accuracy\\\_statement boolean default false,
  electronic\\\_signature text not null,
  status text default 'pending' check (status in ('pending', 'reviewing', 'upheld', 'dismissed')),
  submitted\\\_at timestamptz default now()
);
alter table public.dmca\\\_reports enable row level security;
create policy "Public can insert dmca reports" on public.dmca\\\_reports for insert with check (true);
create policy "Users can view reports against them" on public.dmca\\\_reports for select using (auth.uid() = reported\\\_user\\\_id);

create table public.affiliates (
  id uuid primary key default gen\\\_random\\\_uuid(),
  user\\\_id uuid references public.users(id) on delete cascade unique,
  referral\\\_code text unique default substr(md5(random()::text), 0, 10),
  stripe\\\_connect\\\_id text,
  total\\\_earned numeric default 0,
  pending\\\_payout numeric default 0,
  created\\\_at timestamptz default now()
);
alter table public.affiliates enable row level security;
create policy "Users can view own affiliate record" on public.affiliates for all using (auth.uid() = user\\\_id);

create table public.affiliate\\\_referrals (
  id uuid primary key default gen\\\_random\\\_uuid(),
  affiliate\\\_id uuid references public.affiliates(id),
  referred\\\_user\\\_id uuid references public.users(id),
  plan\\\_converted\\\_to text,
  commission\\\_amount numeric,
  status text default 'pending' check (status in ('pending', 'paid')),
  converted\\\_at timestamptz default now()
);
alter table public.affiliate\\\_referrals enable row level security;
create policy "Affiliates view own referrals" on public.affiliate\\\_referrals for select using (
  affiliate\\\_id in (select id from public.affiliates where user\\\_id = auth.uid())
);
```
---
Supabase Edge Functions (all complete, all deployable)
`viral-discovery/index.ts`
Receives GET request with optional `?category=` param. Calls Gemini 1.5 Flash with prompt: "Return a JSON array of 20 trending video topics right now that would perform well as short-form content on TikTok and Instagram Reels. For each, include: title, channel_name, estimated_views (as string like '2.4M'), viral_score (0-100 integer), platform_tags (array of strings), youtube_search_url (YouTube search URL for the topic). Return only valid JSON, no markdown." Parse Gemini response, return JSON array to client. Auth required.
`generate-clip/index.ts`
Receives POST with `{ project\\\_id, source\\\_url, source\\\_channel, requested\\\_start\\\_seconds, requested\\\_end\\\_seconds }`. Steps: (1) Verify auth JWT. (2) Fetch user record, check is_banned. (3) Check plan quota (Free: 3, Pro: 50, Agency: unlimited) against clips_used_this_month. (4) Validate duration ≤ 90s. (5) Call Gemini to generate caption, hashtags, viral score for this clip. (6) Append required credit to caption. (7) Insert clip record to DB. (8) Increment user clips_used_this_month. (9) Return clip record. Full error handling on each step with appropriate HTTP status codes.
`chatbot/index.ts`
Receives POST with `{ message: string, history: Array<{role: string, content: string}> }`. Auth not required (widget is public). Constructs Gemini conversation with system prompt containing the viraltrim knowledge base (app features, billing tiers, DMCA process, affiliate program, common errors). Calls Gemini 1.5 Flash generateContent with full conversation history. Returns `{ reply: string }`. Rate limit: 20 requests per IP per hour (implement simple counter in Supabase or use a header check).
`stripe-webhook/index.ts`
Handles POST from Stripe. First: verify signature using Stripe-Signature header and STRIPE_WEBHOOK_SECRET. Then switch on event.type: `checkout.session.completed` → create/upsert subscription row, update user plan; `customer.subscription.updated` → upsert subscription with new status and period_end, update user plan field; `customer.subscription.deleted` → update subscription status to 'canceled', set user plan to 'free'; `invoice.payment\\\_failed` → send Resend email to user warning of failed payment; `invoice.payment\\\_succeeded` → if referral exists for this user, calculate 30% commission and update affiliate_referrals status to 'paid', increment affiliate total_earned and pending_payout. Always return 200 — never return 4xx/5xx to Stripe on duplicate events.
`dmca-report/index.ts`
Receives POST with full DMCA form fields. Validates required fields. Inserts to dmca_reports table. Sends two Resend emails: (1) Admin notification to `admin@viraltrim.com` with full report details formatted in HTML. (2) Reporter acknowledgement: "We have received your DMCA takedown notice and will review it within 5 business days." Returns 200 with success message.
`enforce-dmca-strikes/index.ts`
Receives POST with `{ reported\\\_user\\\_id }`. Counts dmca_reports where reported_user_id matches and status = 'upheld'. If count >= 3: update users set is_banned = true, call Stripe API to cancel the user's active subscription (fetch from subscriptions table), send Resend email to user explaining termination. Returns result object.
`send-welcome-email/index.ts`
Triggered by Supabase Auth webhook on user signup. Sends branded welcome email via Resend: subject "Welcome to viraltrim!", HTML body with Clash Display heading, brief getting started guide (3 steps), CTA button to dashboard. From: `hello@viraltrim.com`.
---
Stripe Integration Details
Three products in Stripe Dashboard:
Free: no Stripe product (default plan)
Pro: $29/month recurring, price ID stored as `STRIPE\\\_PRO\\\_PRICE\\\_ID`
Agency: $99/month recurring, price ID stored as `STRIPE\\\_AGENCY\\\_PRICE\\\_ID`
Checkout flow: when user clicks "Upgrade to Pro" (from upgrade modal or pricing page), call a Supabase Edge Function `create-checkout-session` that creates a Stripe Checkout Session with: mode 'subscription', the correct price ID, success_url pointing to `/dashboard?upgraded=true`, cancel_url pointing back to current page, customer email pre-filled, metadata including user_id. Return the session URL. Frontend redirects to Stripe Checkout. On success, Stripe fires `checkout.session.completed` webhook which the webhook handler processes.
On dashboard load, if URL has `?upgraded=true` param, show a Framer Motion celebration toast: "Welcome to Pro! Your clips are now unlimited." Clear the param from URL after showing.
---
Affiliate System
`?ref=CODE` query param on any public page: store code in localStorage key `viraltrim\\\_ref` if not already set (first touch attribution)
On signup completion (Supabase Auth hook or post-signup Edge Function): if localStorage has `viraltrim\\\_ref`, look up the affiliate record by referral_code, insert `affiliate\\\_referrals` record with `{ affiliate\\\_id, referred\\\_user\\\_id: newUserId, status: 'pending' }`
Commission activation: in Stripe webhook `invoice.payment\\\_succeeded`, if the paying user has a referral record with status 'pending', set status to 'paid', calculate commission_amount as (invoice_amount * 0.30), increment affiliate pending_payout and total_earned
Payout: "Request Payout" button in Affiliate Dashboard calls Edge Function `request-payout` which initiates a Stripe Connect transfer from platform account to the affiliate's connected account
---
Environment Variables — `.env.example`
```
VITE\\\_SUPABASE\\\_URL=
VITE\\\_SUPABASE\\\_ANON\\\_KEY=
SUPABASE\\\_SERVICE\\\_ROLE\\\_KEY=
VITE\\\_STRIPE\\\_PUBLISHABLE\\\_KEY=
STRIPE\\\_SECRET\\\_KEY=
STRIPE\\\_WEBHOOK\\\_SECRET=
STRIPE\\\_PRO\\\_PRICE\\\_ID=
STRIPE\\\_AGENCY\\\_PRICE\\\_ID=
RESEND\\\_API\\\_KEY=
RESEND\\\_FROM\\\_EMAIL=noreply@viraltrim.com
RESEND\\\_ADMIN\\\_EMAIL=admin@viraltrim.com
GEMINI\\\_API\\\_KEY=
VITE\\\_APP\\\_URL=https://viraltrim.com
```
---
Complete File Structure
```
src/
  components/
    ui/                         # all shadcn/ui components
    app-sidebar.tsx             # authenticated sidebar nav
    pricing-table.tsx           # reusable pricing cards component
    clip-card.tsx               # clip display card with status badge
    chatbot-widget.tsx          # floating chat widget + panel
    upgrade-modal.tsx           # quota exceeded full-screen modal
    dmca-form.tsx               # DMCA report form component
    three-hero.tsx              # Three.js canvas hero component
    video-trim-bar.tsx          # custom trim bar with handles
    platform-preview.tsx        # device-framed platform preview
    stats-counter.tsx           # GSAP count-up stat component
    viral-video-card.tsx        # discovery feed video card
    schedule-calendar.tsx       # custom calendar with date-fns
  pages/
    HomePage.tsx                # full landing page
    AuthPage.tsx                # login + signup with tab switch
    DashboardPage.tsx           # main dashboard
    EditorStudioPage.tsx        # three-panel clip editor
    SchedulePage.tsx            # calendar + list schedule view
    SettingsPage.tsx            # tabbed settings + billing
    AffiliatePage.tsx           # affiliate dashboard
    DmcaReportPage.tsx          # public DMCA form page
    LegalTermsPage.tsx          # full ToS text
    LegalPrivacyPage.tsx        # full privacy policy text
    LegalCopyrightPage.tsx      # full DMCA policy text
  lib/
    supabase.ts                 # createClient, typed DB helpers
    utils.ts                    # cn() utility, formatters
  hooks/
    useUser.ts                  # auth state + user record
    useSubscription.ts          # plan, quota, billing data
    useClips.ts                 # clip CRUD hooks
    useAffiliate.ts             # affiliate data + referral tracking
  main.tsx                      # createBrowserRouter, providers, routes
supabase/
  functions/
    viral-discovery/index.ts
    generate-clip/index.ts
    chatbot/index.ts
    stripe-webhook/index.ts
    create-checkout-session/index.ts
    dmca-report/index.ts
    enforce-dmca-strikes/index.ts
    send-welcome-email/index.ts
    request-payout/index.ts
  migrations/
    001\\\_initial\\\_schema.sql      # full schema with RLS
.env.example
vercel.json                     # SPA rewrite rule
README.md                       # setup, deployment, env var guide
```
---
Absolute Constraints
Every file is complete and immediately deployable — no `// TODO`, no `...rest`, no stubs, no placeholder functions
Zero mock data in any production code path — all data fetches hit real Supabase tables with loading and error states
GEMINI_API_KEY and SUPABASE_SERVICE_ROLE_KEY never appear in any frontend bundle — server-side Edge Functions only
Fonts: Clash Display + Syne only. No Inter, Roboto, or system-ui anywhere in the codebase
Semantic Tailwind tokens only — no raw color classes like text-blue-500 or bg-purple-600
Three.js hero: properly dispose renderer, geometry, materials, and event listeners on React component unmount
All forms: real validation with inline error messages, no silent failures
Stripe webhook handler: verify signature first, upsert on every event, always return 200 to Stripe
Clip duration: enforced at both client (trim handles) and server (Edge Function rejects > 90s with 400)
Video processing calls are fully async — client receives a clip ID and polls for status, HTTP response never blocks waiting for AI/render completion
Mobile responsive at all breakpoints — px-4 sm:px-6 lg:px-8 gutters on all page wrappers
All modals and dialogs: focus trap, Escape key closes, proper ARIA roles and labels
Dark mode is the only mode — no light mode toggle anywhere
vercel.json must include SPA rewrite: `{ "rewrites": \\\[{ "source": "/(.\\\*)", "destination": "/index.html" }] }`