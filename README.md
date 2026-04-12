| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook Signing Secret (whsec_...) | Secret (Production) |
| `APP_URL` | Base URL of your deployed application | `vars` in wrangler.jsonc |
## 🚀 GitHub Integration & CI/CD
ViralTrim is pre-configured for automated deployments via GitHub Actions.
### 1. Repository Setup
1. Create a new repository on GitHub.
2. Push your code:
   ```bash
   git init
   git remote add origin https://github.com/youruser/viraltrim.git
   git add .
   git commit -m "Initial production push"
   git push -u origin main
   ```
### 2. Configure GitHub Secrets
Navigate to **Settings > Secrets and variables > Actions** in your GitHub repo and add:
- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token (with Edit Workers/D1 permissions).
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare Account ID.
- `STRIPE_SECRET_KEY`: Your Stripe secret key.
- `STRIPE_WEBHOOK_SECRET`: Your Stripe webhook secret.
- `JWT_SECRET`: A secure random string for auth tokens.
- `APP_URL`: Your final production domain (e.g., `https://viraltrim.ai`).
### 3. Automated Deployment
Every push to the `main` branch will automatically build the assets and deploy the worker/Drizzle migrations to Cloudflare.
## ☁️ Cloudflare Production Setup Guide
Follow these steps to deploy and manage your ViralTrim infrastructure.
### 1. Initialize D1 Database
Create your production database. **MANDATORY:** Use `weur` (Western Europe) as the location hint for optimal latency.
# ViralTrim - AI Viral Video Clipper & Auto-Poster
ViralTrim is a production-ready AI marketing engine that identifies viral hooks in long-form videos and automatically transforms them into high-engagement assets for TikTok, Reels, and Shorts.
## 🔐 Test Credentials (QA Access)
Use these accounts to test different subscription tiers. All use the same password.
- **Password**: `password123`
- **Free Account**: `free@viraltrim.ai` (3 clips/mo)
- **Creator Account**: `creator@viraltrim.ai` (50 clips/mo)
- **Agency Account**: `agency@viraltrim.ai` (Unlimited clips)
- **Unlimited Admin**: `idoumahart@gmail.com` (Hardcoded Unlimited)
## 🛠️ Environment Variables Reference
Configure these in `wrangler.jsonc` for local development or using `wrangler secret put` for production.
| Variable | Description | Config Location |
|----------|-------------|-----------------|
| `JWT_SECRET` | Secret key for signing session tokens | `vars` in wrangler.jsonc |
| `STRIPE_SECRET_KEY` | Stripe API Secret Key (sk_test_...) | Secret (Production) |