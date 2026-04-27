# Deployment Notes

## Cloud Run Min-Instances (Cold Start Fix)

Your Cloud Run services (renderer, whisper, vision) currently use `min-instances=0`, causing 30-60s cold starts after 15 minutes of idle time.

**Fix:** Set `min-instances=1` on all three services:

```bash
gcloud run services update viraltrim-renderer --min-instances=1 --region=us-central1
gcloud run services update viraltrim-whisper --min-instances=1 --region=us-central1
gcloud run services update viraltrim-vision --min-instances=1 --region=us-central1
```

Cost: ~$5/month per service. This eliminates cold starts entirely.

## R2 Public URL

The `R2_PUBLIC_URL` env var has been added to `worker/core-utils.ts`. Set it in your Wrangler secrets:

```bash
npx wrangler secret put R2_PUBLIC_URL
# Value: https://media.viraltrim.com
```

If not set, it falls back to `https://media.viraltrim.com`.

## Database Migrations

Apply migration `0007_add_render_jobs_and_aspect_ratio.sql` to your D1 database:

```bash
npx wrangler d1 migrations apply viraltrim-db --local   # dev
npx wrangler d1 migrations apply viraltrim-db            # production
```

This adds:
- `render_jobs` table (async render queue)
- `aspect_ratio` column to `clips`
- Performance indexes on frequently queried columns

## Internal Secret (Production Safety)

All three Python renderers now **fail-closed** in production. If `INTERNAL_SECRET` is not set and `ENV=production`, the service will exit on startup instead of accepting all requests.

Make sure `ENV=production` and `INTERNAL_SECRET=<your-secret>` are set in all Cloud Run service environments.
