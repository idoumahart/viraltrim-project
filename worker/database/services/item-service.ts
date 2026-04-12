};
}
export class ItemService {
    constructor(private db: Database) {}
    async create(userId: string, data: CreateItemData): Promise<Item> {
        const [item] = await this.db.insert(items).values({
            id: generateId(),
            userId,
            title: data.title,
            description: data.description,
            status: data.status || 'draft',
            metadata: data.metadata || {},
        }).returning();
        return item;
    }
    async getById(itemId: string, userId: string): Promise<Item | null> {
        const [item] = await this.db.select().from(items).where(and(eq(items.id, itemId), eq(items.userId, userId))).limit(1);
        return item || null;
import { eq, and, desc, asc, like, sql } from 'drizzle-orm';
import type { Database } from '../index';
import { items, type Item, type NewItem } from '../schema';
import { generateId } from '../../auth';
export interface CreateItemData {
    title: string;
    description?: string;
    status?: 'draft' | 'active' | 'archived';
    metadata?: Record<string, unknown>;
}
export interface ListItemsOptions {
    status?: 'draft' | 'active' | 'archived';
    search?: string;
    sortBy?: 'createdAt' | 'updatedAt' | 'title';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
}
export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;