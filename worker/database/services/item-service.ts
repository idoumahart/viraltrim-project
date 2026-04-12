import { and, asc, count, desc, eq, like } from "drizzle-orm";
import type { Database } from "../index";
import { items, type Item, type NewItem } from "../schema";
import { generateId } from "../../auth";

export interface CreateItemData {
  title: string;
  description?: string;
  status?: "draft" | "active" | "archived";
  metadata?: Record<string, unknown>;
}

export interface ListItemsOptions {
  status?: "draft" | "active" | "archived";
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "title";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export class ItemService {
  constructor(private db: Database) {}

  async create(userId: string, data: CreateItemData): Promise<Item> {
    const [item] = await this.db
      .insert(items)
      .values({
        id: generateId(),
        userId,
        title: data.title,
        description: data.description,
        status: data.status ?? "draft",
        metadata: data.metadata ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies NewItem)
      .returning();
    if (!item) {
      throw new Error("Failed to create item");
    }
    return item;
  }

  async getById(itemId: string, userId: string): Promise<Item | null> {
    const [row] = await this.db
      .select()
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async list(userId: string, options: ListItemsOptions = {}): Promise<PaginatedResult<Item>> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const conditions = [eq(items.userId, userId)];
    if (options.status) {
      conditions.push(eq(items.status, options.status));
    }
    if (options.search?.trim()) {
      conditions.push(like(items.title, `%${options.search.trim()}%`));
    }
    const whereClause = and(...conditions);
    const orderCol =
      options.sortBy === "title"
        ? items.title
        : options.sortBy === "updatedAt"
          ? items.updatedAt
          : items.createdAt;
    const orderFn = options.sortOrder === "asc" ? asc : desc;
    const rows = await this.db
      .select()
      .from(items)
      .where(whereClause)
      .orderBy(orderFn(orderCol))
      .limit(limit)
      .offset(offset);
    const [countRow] = await this.db.select({ c: count() }).from(items).where(whereClause);
    const total = Number(countRow?.c ?? 0);
    return {
      data: rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total,
      },
    };
  }
}

export function createItemService(db: Database): ItemService {
  return new ItemService(db);
}
