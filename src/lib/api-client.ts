/**
 * ViralTrim Production API Client
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
export interface User {
  id: string;
  email: string;
  username?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  stripeCustomerId?: string | null;
}
export interface Subscription {
  id: string;
  userId: string;
  status: string;
  planName?: string | null;
  planInterval?: 'month' | 'year' | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
}
export interface Price {
  id: string;
  unitAmount: number;
  currency: string;
  recurring?: { interval: 'month' | 'year' } | null;
  product?: { name: string; description?: string } | null;
}
export interface Clip {
  id: string;
  title: string;
  platform: string;
  duration?: string;
  status: string;
  views?: string;
  engagement?: string;
  thumbnail?: string;
  videoUrl?: string;
  createdAt: Date;