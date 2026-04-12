import { Hono, Context } from 'hono';
import { createDatabase } from './database';
import { createUserService } from './database/services/user-service';
import { createClipService } from './database/services/clip-service';
import { createSubscriptionService } from './database/services/subscription-service';
import { validateSession, extractBearerToken, createSession } from './auth';
import { getStripe, getOrCreateCustomer, createCheckoutSession, createPortalSession, verifyWebhookSignature, WEBHOOK_EVENTS } from './stripe';
import { Env } from './core-utils';
import { AppEnv } from './types/app-env';
import { tos_agreements } from './database/schema';
const authMiddleware = async (c: Context<AppEnv>, next: () => Promise<void>) => {
    const token = extractBearerToken(c.req.raw);
    if (!token) return c.json({ success: false, error: 'Authorization required' }, 401);
    const db = createDatabase(c.env.DB);
    const jwtSecret = String(c.env.JWT_SECRET || 'insecure_development_secret');
    try {
        const result = await validateSession(db, token, jwtSecret);
        if (!result) return c.json({ success: false, error: 'Invalid or expired session' }, 401);
        c.set('user', result.user);
        c.set('token', token);
        await next();
    } catch (error) {
        console.error('[AUTH MIDDLEWARE] Critical failure:', error);
        return c.json({ success: false, error: 'Identity verification failed' }, 500);
    }
};
export function userRoutes(app: Hono<{ Bindings: Env }>) {
    const api = app as unknown as Hono<AppEnv>;
    api.post('/api/auth/register', async (c) => {
        try {
            const body = await c.req.json().catch(() => ({}));
            const db = createDatabase(c.env.DB);
            const userService = createUserService(db);
            const { user, error } = await userService.register(body);
            if (error || !user) return c.json({ success: false, error }, 400);
            const jwtSecret = String(c.env.JWT_SECRET || 'insecure_development_secret');
            const { token } = await createSession(db, String(user.id), c.req.raw, jwtSecret);
            return c.json({ success: true, data: { user, token } });
        } catch (error) {
            console.error('[API] Register Exception:', error);
            return c.json({ success: false, error: 'System Provisioning Error' }, 500);
        }
    });