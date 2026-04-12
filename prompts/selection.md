### Ideal For:
- SaaS applications with paid plans
- Subscription-based services
- Apps requiring payment processing
- Products with freemium models
- Services with usage-based billing

### Key Features:
- **Stripe Integration** - Full payment processing with Checkout and Customer Portal
- **Subscription Management** - Create, update, cancel subscriptions
- **Webhook Handling** - Secure event processing with signature verification
- **D1 Database** - Track subscriptions, payments, and user data
- **Drizzle ORM** - Type-safe database queries
- **JWT Authentication** - Secure session management
- **Payment History** - Track all user payments
- **Customer Portal** - Self-service billing management

### Tech Stack:
- React 18 + TypeScript + Vite
- Cloudflare Workers + D1 + KV
- Stripe SDK for payments
- Drizzle ORM for database
- Hono for API routing
- shadcn/ui components
- Tailwind CSS

### Stripe Features Included:
- Checkout Sessions (subscription & one-time)
- Customer Portal integration
- Webhook event handling
- Subscription lifecycle management
- Payment tracking and receipts
- Trial period support
- Promotion codes support

### When NOT to Choose:
- Simple static sites (use `minimal-vite`)
# vite-cf-stripe-runner

## When to Select This Template

Choose this template when you need a **SaaS application** with Stripe payments, subscriptions, and user billing - the complete monetization stack.