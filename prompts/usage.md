# Stripe Payments Template Usage Guide

## Quick Start

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Deploy to Cloudflare
bun run deploy
```

## Stripe Setup

### 1. Get Stripe API Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Get your **Secret Key** from Developers → API keys
3. For testing, use keys starting with `sk_test_`

### 2. Configure Environment Variables

Update `wrangler.jsonc` for development:

```jsonc
"vars": {
  "STRIPE_SECRET_KEY": "sk_test_your_key_here",
  "STRIPE_WEBHOOK_SECRET": "whsec_your_secret_here",
  "APP_URL": "http://localhost:5173"
}
```

For production, use Wrangler secrets:

```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET