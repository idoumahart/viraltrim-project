import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  DollarSign,
  TrendingUp,
  Copy,
  ExternalLink,
  Gift,
  CheckCircle,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { api, type AffiliateStats } from "@/lib/api-client";
import { toast } from "sonner";

export default function AffiliatePage() {
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.getAffiliateStats();
        if (res.success && res.data) {
          setStats(res.data);
        }
      } catch (err) {
        console.error("Affiliate sync error", err);
      } finally {
        setLoading(false);
      }
    };
    void fetchStats();
  }, []);

  const copyRefLink = () => {
    if (!stats) {
      return;
    }
    const link = `${window.location.origin}/register?ref=${stats.referralCode}`;
    void navigator.clipboard.writeText(link);
    toast.success("Referral link copied to clipboard!");
  };

  if (loading) {
    return (
      <AppLayout container>
        <div className="flex justify-center py-24">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout container contentClassName="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold">Affiliate</h1>
        <p className="text-muted-foreground">30% recurring commission on paying referrals.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Referral code</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <code className="text-lg font-mono">{stats?.referralCode ?? "—"}</code>
            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={copyRefLink}>
                <Copy className="h-4 w-4 mr-1" />
                Copy link
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Join viraltrim: ${window.location.origin}/register?ref=${stats?.referralCode}`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalConversions ?? 0}</div>
            <p className="text-xs text-muted-foreground">Active pending: {stats?.activeReferrals ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(stats?.lifetimeEarnings ?? 0).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Pending: ${(stats?.pendingPayout ?? 0).toFixed(2)}</p>
            <Progress
              value={Math.min(100, ((stats?.pendingPayout ?? 0) / 50) * 100)}
              className="h-2 mt-3"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Request payout at $50 (Connect required)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Performance
          </CardTitle>
          <CardDescription>Clicks tracking can be wired to KV in a follow-up.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" className="gap-2" disabled>
            <CheckCircle className="h-4 w-4" />
            Request payout
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </AppLayout>
  );
}
