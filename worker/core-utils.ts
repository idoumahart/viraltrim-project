/**
 * Core Utilities and Types - DO NOT MODIFY
 *
 * Environment bindings and shared types for the worker.
 */

// ========================================
// ENVIRONMENT BINDINGS
// ========================================

export interface Env {
    // D1 Database
    DB: D1Database;

    // KV Namespaces
    SESSIONS: KVNamespace;
    CACHE: KVNamespace;

    // Assets
    ASSETS: Fetcher;

    // Environment Variables
    JWT_SECRET: string;
    SESSION_TTL: string;

    // Stripe Configuration
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    APP_URL: string;
}