/**
 * Database Service - Drizzle ORM with D1
 *
 * Provides type-safe database access for Cloudflare D1.
 */

import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Create database instance from D1 binding
 */
export function createDatabase(d1: D1Database): Database {
    return drizzle(d1, { schema });
}

export * from './schema';