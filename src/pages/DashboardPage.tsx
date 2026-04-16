import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Plus, Scissors, Zap, Clock, ChevronRight, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api, type UsageSummary } from "@/lib/api-client";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

interface ActivityRow {
  id: string;
  type: string;
  title: string;
  createdAt: Date;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [activityRes, usageRes, clipsRes] = await Promise.all([
          api.getRecentActivity(),
          api.getUsage(),
          api.getClips(),
        ]);
        if (!isMounted) {
          return;
        }
        if (activityRes.success && activityRes.data) {
          setActivity(activityRes.data);
        }
        if (usageRes.success && usageRes.data) {
          setUsage(usageRes.data);
        }
        if (clipsRes.success && clipsRes.data) {
          setClips(clipsRes.data);
        }
      } catch (err) {
        console.error("Data sync failed", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    void fetchData();
    return () => {
      isMounted = false;
    };
  }, []);

  const usagePct =
    usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  return (
    <AppLayout container contentClassName="space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-display font-extrabold tracking-tight uppercase">
            Producer workspace
          </h1>
          <p className="text-muted-foreground font-medium">
            Welcome back, {user?.displayName?.split(" ")[0] || "Operator"}.
            {user?.plan ? (
              <Badge variant="secondary" className="ml-2 capitalize">
                {user.plan}
              </Badge>
            ) : null}
          </p>
        </div>
        <Button className="btn-gradient gap-2" onClick={() => navigate("/discovery")}>
          <Plus className="h-4 w-4" />
          New discovery
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Clips</CardTitle>
                <Scissors className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{clips.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Generated this month: {usage?.used ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Viral Score</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  {clips.length ? Math.round(clips.reduce((sum, c) => sum + (c.viralScore || 0), 0) / clips.length) : 0}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Based on clip analysis</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Current Plan</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize">{usage?.plan ?? user?.plan ?? "free"}</div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${usagePct}%` }} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Quick Actions</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/schedule")}>
                  Schedule
                </Button>
                <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/studio/videos")}>
                  Studio
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  activity.slice(0, 5).map((a) => (
                    <div key={a.id} className="flex justify-between text-sm border-b border-border/60 pb-2">
                      <span>{a.title}</span>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Clips</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {clips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No clips generated yet.</p>
                ) : (
                  clips.slice(0, 5).map((c) => (
                    <div key={c.id} className="flex items-center gap-3 text-sm border-b border-border/60 pb-2">
                      <div className="h-8 w-8 bg-muted rounded overflow-hidden">
                        {c.thumbnail && <img src={c.thumbnail} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{c.title || "Untitled clip"}</p>
                        <p className="text-xs text-muted-foreground">Score: {c.viralScore || "—"}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => navigate("/studio/editor", { state: { clip: c } })}>
                        Edit
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

        </>
      )}
    </AppLayout>
  );
}
