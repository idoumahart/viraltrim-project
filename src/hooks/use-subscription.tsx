import React, { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { api, type Subscription, type Price, type Payment } from '@/lib/api-client';
interface SubscriptionState {
  subscription: Subscription | null;
  prices: Price[];
  payments: Payment[];
  loading: boolean;
  error: string | null;
}
interface SubscriptionContextValue extends SubscriptionState {
  refreshSubscription: () => Promise<void>;
  refreshPrices: () => Promise<void>;
  refreshPayments: () => Promise<void>;
  createCheckout: (priceId: string, trialDays?: number, quantity?: number) => Promise<string | null>;
  createPayment: (priceId: string, quantity?: number) => Promise<string | null>;
  openPortal: () => Promise<void>;
  isSubscribed: boolean;
  isTrialing: boolean;
  clearError: () => void;
}
const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SubscriptionState>({
    subscription: null,
    prices: [],
    payments: [],
    loading: true,
    error: null
  });
  const loadData = useCallback(async () => {
    // Immediate return if not authenticated to prevent unnecessary API noise
    if (!api.isAuthenticated()) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }
    try {
      const [subResponse, pricesResponse] = await Promise.allSettled([
        api.getSubscription(),
        api.getPrices()
      ]);
      const subResult = subResponse.status === 'fulfilled' ? subResponse.value : null;
      const pricesResult = pricesResponse.status === 'fulfilled' ? pricesResponse.value : null;
      setState({