import React, { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PricingTable } from "@/components/pricing-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CreditCard, Zap, ShieldCheck } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import { formatDistanceToNow } from "date-fns";

export default function BillingPage() {
  const { isSubscribed, subscription, openPortal, createCheckout, prices } = useSubscription();
  const { user } = useAuth();
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const res = await api.getUsage();
      if (mounted && res.success && res.data) {
        setUsage({ used: res.data.used, limit: res.data.limit });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const pct =
    usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  return (
    <AppLayout container contentClassName="space-y-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-display font-extrabold tracking-tight">Billing & Subscription</h1>
        <p className="text-lg text-muted-foreground">Manage your plan and usage.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-10">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-xl">Usage</CardTitle>
              <CardDescription>Clips used this month vs plan limit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 py-4">
              <div className="flex justify-between items-end">
                <span className="text-sm font-medium">AI clips</span>
                <span className="text-sm font-mono text-primary">
                  {usage ? `${usage.used} / ${usage.limit}` : `0 / —`}
                </span>
              </div>
              <Progress value={pct} className="h-2.5" />
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Current plan
              </CardTitle>
              <CardDescription>
                <span className="capitalize font-semibold text-foreground">{user?.plan ?? "free"}</span>
                {" plan"}
                {isSubscribed && subscription?.currentPeriodEnd
                  ? ` · renews ${formatDistanceToNow(subscription.currentPeriodEnd, { addSuffix: true })}`
                  : " · No active Stripe subscription"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="outline" className="gap-2" onClick={() => void openPortal()}>
                <CreditCard className="h-4 w-4" />
                Customer portal
              </Button>
              {prices[0] ? (
                <Button
                  className="btn-gradient gap-2"
                  onClick={async () => {
                    const url = await createCheckout(prices[0].id);
                    if (url) {
                      window.location.href = url;
                    }
                  }}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Upgrade with Stripe
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-4">
          <p className="text-sm text-muted-foreground mb-4">
            Pick a tier below. Checkout runs on the Worker with live Stripe prices when configured.
          </p>
        </div>
      </div>
      <PricingTable />
    </AppLayout>
  );
}
