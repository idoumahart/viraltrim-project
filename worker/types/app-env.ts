/**
 * Local Hono environment type for the Stripe template.
 * Strongly typed Variables for middleware context.
 */
import { User } from '../database/schema';
export type { Env } from '../core-utils';
export type AppEnv = {
  Bindings: import('../core-utils').Env;
  Variables: {
    user: User;
    token: string;
    [key: string]: unknown;
  };
};