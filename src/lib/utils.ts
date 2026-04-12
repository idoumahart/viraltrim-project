import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
/**
 * Formats a currency amount in cents to a localized string.
 * @param amount Amount in cents (e.g., 2900 for $29.00)
 * @param currency ISO currency code (e.g., 'usd')
 */
export function formatPrice(amount: number | null | undefined, currency: string = 'usd'): string {
    if (amount === null || amount === undefined) return 'Free';
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amount / 100);
    } catch (e) {
        return `$${(amount / 100).toFixed(2)}`;
    }
}
/**
 * Returns a human-readable interval label.
 */
export function getIntervalLabel(interval: 'month' | 'year' | string | null | undefined): string {
    if (!interval) return '';
    const norm = interval.toLowerCase();
    if (norm === 'month' || norm === 'monthly') return '/mo';
    if (norm === 'year' || norm === 'yearly') return '/yr';
    return `/${norm}`;
}