import React, {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { api, type Subscription, type Price, type Payment } from "@/lib/api-client";

interface SubscriptionState {
  subscription: Subscription | null;
  prices: Price[];
  payments: Payment[];
  loading: boolean;
  error: string | null;
}

interface SubscriptionContextValue extends SubscriptionState {
  refreshSubscription: () => Promise<void>;
  refreshPrices: () => Promise<void>;
  refreshPayments: () => Promise<void>;
  createCheckout: (priceId: string, trialDays?: number, quantity?: number) => Promise<string | null>;
  createPayment: (priceId: string, quantity?: number) => Promise<string | null>;
  openPortal: () => Promise<void>;
  isSubscribed: boolean;
  isTrialing: boolean;
  clearError: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SubscriptionState>({
    subscription: null,
    prices: [],
    payments: [],
    loading: true,
    error: null,
  });

  const loadData = useCallback(async () => {
    try {
      const [subResponse, pricesResponse] = await Promise.allSettled([
        api.getSubscription(),
        api.getPrices(),
      ]);
      const subResult = subResponse.status === "fulfilled" ? subResponse.value : null;
      const pricesResult = pricesResponse.status === "fulfilled" ? pricesResponse.value : null;
      let payments: Payment[] = [];
      
      const payRes = await api.getPayments();
      if (payRes.success && payRes.data) {
         payments = payRes.data;
      }
      setState({
        subscription: subResult?.success ? (subResult.data ?? null) : null,
        prices: pricesResult?.success && pricesResult.data ? pricesResult.data : [],
        payments,
        loading: false,
        error: subResult && !subResult.success ? subResult.error || null : null,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Billing unavailable";
      setState((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
      toast.error("Billing data could not be loaded", { description: message });
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshSubscription = useCallback(async () => {
    const res = await api.getSubscription();
    if (res.success) {
      setState((prev) => ({ ...prev, subscription: res.data ?? null }));
    }
  }, []);

  const refreshPrices = useCallback(async () => {
    const res = await api.getPrices();
    if (res.success && res.data) {
      setState((prev) => ({ ...prev, prices: res.data ?? [] }));
    }
  }, []);

  const refreshPayments = useCallback(async () => {
    const res = await api.getPayments();
    if (res.success && res.data) {
      setState((prev) => ({ ...prev, payments: res.data ?? [] }));
    }
  }, []);

  const createCheckout = useCallback(
    async (priceId: string, trialDays?: number, quantity?: number): Promise<string | null> => {
      const res = await api.createCheckout(priceId, trialDays, quantity);
      if (res.success && res.data?.url) {
        return res.data.url;
      }
      toast.error(res.error || "Could not start checkout");
      return null;
    },
    [],
  );

  const createPayment = useCallback(async (priceId: string, quantity?: number): Promise<string | null> => {
    return createCheckout(priceId, undefined, quantity);
  }, [createCheckout]);

  const openPortal = useCallback(async () => {
    const res = await api.openPortal();
    if (res.success && res.data?.url) {
      window.open(res.data.url, "_blank", "noopener,noreferrer");
      return;
    }
    toast.error(res.error || "Could not open billing portal");
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const isSubscribed =
    state.subscription?.status === "active" || state.subscription?.status === "trialing";
  const isTrialing = state.subscription?.status === "trialing";

  const value: SubscriptionContextValue = {
    ...state,
    refreshSubscription,
    refreshPrices,
    refreshPayments,
    createCheckout,
    createPayment,
    openPortal,
    isSubscribed,
    isTrialing,
    clearError,
  };

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscription must be used within SubscriptionProvider");
  }
  return ctx;
}
