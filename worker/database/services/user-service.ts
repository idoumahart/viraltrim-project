import { eq } from 'drizzle-orm';
import type { Database } from '../index';
import { users, type User, type NewUser } from '../schema';
import { hashPassword, verifyPassword, generateId } from '../../auth';
export interface RegisterData { 
    email: string; 
    password: string; 
    displayName?: string; 
}
export interface LoginData { 
    email: string; 
    password: string; 
}
export class UserService {
    constructor(private db: Database) {}
    async register(data: RegisterData): Promise<{ user: User | null; error?: string }> {
        const normalizedEmail = data.email?.toLowerCase().trim();
        if (!normalizedEmail || !data.password) {
            return { user: null, error: 'Email and password are required' };
        }
        try {
            console.log(`[USER SERVICE] Registering operator: ${normalizedEmail}`);
            const existing = await this.findByEmail(normalizedEmail);
            if (existing) {
                console.warn(`[USER SERVICE] Conflict: ${normalizedEmail} already exists`);
                return { user: null, error: 'Identity already exists in lab database' };
            }
            console.log('[USER SERVICE] Hashing secure token...');
            const passwordHash = await hashPassword(data.password);
            const userId = generateId();
            console.log(`[USER SERVICE] Provisioning ID: ${userId}`);
            const [user] = await this.db.insert(users).values({
                id: userId,
                email: normalizedEmail,
                displayName: data.displayName || data.email.split('@')[0],
                passwordHash,
                provider: 'email',
                providerId: userId,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            }).returning();
            if (!user) {