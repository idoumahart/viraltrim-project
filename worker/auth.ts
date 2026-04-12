import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import { eq, and, gt, isNull } from 'drizzle-orm';
import type { Database } from './database';
import { users, sessions, type User, type Session } from './database/schema';
export interface AuthResult {
    success: boolean;
    user?: User;
    token?: string;
    error?: string;
}
export interface TokenPayload {
    sub: string;
    sid: string;
    email: string;
    iat: number;
    exp: number;
}
const SALT_ROUNDS = 10;
export async function hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, SALT_ROUNDS);
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
        return await bcrypt.compare(password, hash);
    } catch (error) {
        return false;
    }
}
export async function generateToken(
    user: User,
    sessionId: string,
    jwtSecret: string,
    ttlSeconds: number = 604800
): Promise<string> {
    const secret = new TextEncoder().encode(jwtSecret);
    return await new jose.SignJWT({
        sub: user.id,
        sid: sessionId,
        email: user.email,
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()