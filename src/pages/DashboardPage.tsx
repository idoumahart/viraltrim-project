import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Scissors, Zap, Clock, ChevronRight, Loader2, Calendar, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api, type UsageSummary } from "@/lib/api-client";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";

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
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [activityRes, usageRes, clipsRes, scheduledRes] = await Promise.all([
          api.getRecentActivity(),
          api.getUsage(),
          api.getClips(),
          api.getScheduledPosts(),
        ]);
        if (!isMounted) return;
        if (activityRes.success && activityRes.data) setActivity(activityRes.data);
        if (usageRes.success && usageRes.data) setUsage(usageRes.data);
        if (clipsRes.success && clipsRes.data) setClips(clipsRes.data);
        if (scheduledRes.success && scheduledRes.data) setScheduledPosts(scheduledRes.data);
      } catch (err) {
        console.error("Data sync failed", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    void fetchData();
    return () => { isMounted = false; };
  }, []);

  const usagePct =
    usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  const platformIcon: Record<string, string> = {
    youtube: "▶️",
    tiktok: "🎵",
    instagram: "📸",
    twitter: "🐦",
    facebook: "📘",
  };

  return (
    <AppLayout container contentClassName="space-y-10">
      {/* Header — no tier badge here, it's in the Current Plan card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-display font-extrabold tracking-tight uppercase">
            Producer workspace
          </h1>
          <p className="text-muted-foreground font-medium">
            Welcome back, {user?.displayName?.split(" ")[0] || "Operator"}.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Stat Cards */}
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
                <div className="text-xs text-muted-foreground mt-1">{usage?.used ?? 0} / {usage?.limit ?? "∞"} clips used</div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Quick Actions</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => navigate("/schedule")}>
                  <Calendar className="h-3.5 w-3.5" />
                  Schedule Post
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => navigate("/discovery")}>
                  <TrendingUp className="h-3.5 w-3.5" />
                  Viral Search
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Lower row */}
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  activity.slice(0, 5).map((a) => (
                    <div key={a.id} className="flex justify-between text-sm border-b border-border/60 pb-2">
                      <span className="truncate max-w-[60%]">{a.title}</span>
                      <span className="text-muted-foreground text-xs shrink-0">
                        {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Recent Clips */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Recent Clips</CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/studio/clips")}>
                    View all <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {clips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No clips generated yet.</p>
                ) : (
                  clips.slice(0, 5).map((c) => (
                    <div key={c.id} className="flex items-center gap-3 text-sm border-b border-border/60 pb-2">
                      <div className="h-8 w-8 bg-muted rounded overflow-hidden shrink-0">
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

            {/* Scheduled Posts */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Scheduled Posts</CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/schedule")}>
                    Manage <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {scheduledPosts.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <Calendar className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No posts scheduled.</p>
                    <Button variant="outline" size="sm" onClick={() => navigate("/schedule")}>
                      Schedule a Post
                    </Button>
                  </div>
                ) : (
                  scheduledPosts
                    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
                    .slice(0, 5)
                    .map((p) => (
                      <div key={p.id} className="flex items-center gap-3 text-sm border-b border-border/60 pb-2">
                        <span className="text-base shrink-0">
                          {platformIcon[p.platform] ?? "📤"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{p.title || "Untitled"}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(p.scheduledFor), "MMM d, h:mm a")}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
                          {p.status ?? "scheduled"}
                        </Badge>
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
