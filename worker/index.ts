const bust = shouldRetry && import.meta.env?.DEV ? `?t=${now}` : '';
  const spec = `${USER_ROUTES_MODULE}${bust}`;

  try {
    const mod = (await import(/* @vite-ignore */ spec)) as UserRoutesModule;
    mod.userRoutes(app);
    userRoutesLoaded = true;
    userRoutesLoadError = null;
  } catch (e) {
    userRoutesLoadError = e instanceof Error ? e.message : String(e);
  }
};

export type ClientErrorReport = { message: string; url: string; timestamp: string } & Record<string, unknown>;

const app = new Hono<{ Bindings: Env }>();

userRoutes(app);
// Making changes to this file is **STRICTLY** forbidden. Please add your routes in `userRoutes.ts` file.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Env } from './core-utils';
import { userRoutes } from './userRoutes';
export * from './core-utils';

type UserRoutesModule = { userRoutes: (app: Hono<{ Bindings: Env }>) => void };

const USER_ROUTES_MODULE = './userRoutes';
const RETRY_MS = 750;
let nextRetryAt = 0;
let userRoutesLoaded = false;
let userRoutesLoadError: string | null = null;

const safeLoadUserRoutes = async (app: Hono<{ Bindings: Env }>) => {
  if (userRoutesLoaded) return;

  const now = Date.now();
  const shouldRetry = userRoutesLoadError !== null;
  if (shouldRetry && now < nextRetryAt) return;
  nextRetryAt = now + RETRY_MS;