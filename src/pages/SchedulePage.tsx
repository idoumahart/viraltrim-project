import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Video, Share2, Play, Clock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type ScheduledPost } from "@/lib/api-client";
import { toast } from "sonner";
import { format } from "date-fns";

export default function SchedulePage() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSchedule = async () => {
      const res = await api.getScheduledPosts();
      if (res.success && res.data) {
        setPosts(res.data);
      } else {
        toast.error(res.error || "Failed to sync schedule");
      }
      setLoading(false);
    };
    void fetchSchedule();
  }, []);

  return (
    <AppLayout container contentClassName="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Content schedule</h1>
          <p className="text-muted-foreground">Cross-platform distribution pipeline.</p>
        </div>
        <Button className="btn-gradient shadow-primary gap-2">
          <Plus className="mr-2 h-4 w-4" />
          Schedule post
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>Select a day to review posts.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-24" />
            ) : posts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled posts yet.</p>
            ) : (
              posts.map((p) => (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-border p-3",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <Video className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.clipTitle}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Share2 className="h-3 w-3" />
                        {p.platform}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline">{p.status}</Badge>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center justify-end gap-1">
                      <Clock className="h-3 w-3" />
                      {format(p.scheduledFor, "MMM d, HH:mm")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
