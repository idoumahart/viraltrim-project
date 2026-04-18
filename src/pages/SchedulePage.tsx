import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Video, Share2, Clock, Plus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type ScheduledPost, type Clip } from "@/lib/api-client";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

function ScheduleModal({ onScheduled }: { onScheduled: () => void }) {
  const [open, setOpen] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loadingClips, setLoadingClips] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [clipId, setClipId] = useState("");
  const [platform, setPlatform] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());

  useEffect(() => {
    if (open) {
      setLoadingClips(true);
      api.getClips().then(res => {
        if (res.success && res.data) setClips(res.data);
        setLoadingClips(false);
      });
    }
  }, [open]);

  const handleSchedule = async () => {
    if (!clipId || !platform || !date) {
      toast.error("Please fill in all fields.");
      return;
    }
    setIsSubmitting(true);
    const res = await api.schedulePost(clipId, platform, date);
    setIsSubmitting(false);
    if (res.success) {
      toast.success("Post scheduled successfully!");
      setOpen(false);
      onScheduled();
    } else {
      toast.error(res.error || "Failed to schedule post");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="btn-gradient shadow-primary gap-2">
          <Plus className="mr-2 h-4 w-4" />
          Schedule post
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Schedule Post</DialogTitle>
          <DialogDescription>Pick a clip, platform, and date to auto-publish.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <span className="text-sm font-medium">Select Clip</span>
            <Select value={clipId} onValueChange={setClipId} disabled={loadingClips}>
              <SelectTrigger>
                <SelectValue placeholder={loadingClips ? "Loading clips..." : "Choose a clip"} />
              </SelectTrigger>
              <SelectContent>
                {clips.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.title || "Untitled"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">Select Platform</span>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TikTok">TikTok</SelectItem>
                <SelectItem value="Instagram">Instagram (Reels)</SelectItem>
                <SelectItem value="YouTube">YouTube (Shorts)</SelectItem>
                <SelectItem value="Twitter">X (Twitter)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">Select Date</span>
            <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border p-3" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSchedule} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Schedule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConnectSocialsCard() {
  const handleConnect = (platform: string) => {
    toast.info(`OAuth connection for ${platform} coming soon!`);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>Link your social media to enable one-click scheduling.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {[
          { name: "TikTok", icon: "🎵", connected: false },
          { name: "YouTube Shorts", icon: "▶️", connected: false },
          { name: "Instagram Reels", icon: "📸", connected: false },
          { name: "X (Twitter)", icon: "🐦", connected: false }
        ].map(p => (
          <div key={p.name} className="flex items-center justify-between p-3 border rounded-lg bg-card shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-xl">{p.icon}</span>
              <span className="font-medium text-sm">{p.name}</span>
            </div>
            <Button size="sm" variant={p.connected ? "outline" : "default"} onClick={() => handleConnect(p.name)}>
              {p.connected ? "Connected" : "Connect"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default function SchedulePage() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchSchedule = async () => {
    setLoading(true);
    const res = await api.getScheduledPosts();
    if (res.success && res.data) {
      setPosts(res.data);
    } else {
      toast.error(res.error || "Failed to sync schedule");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSchedule();
  }, []);

  return (
    <AppLayout container contentClassName="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Content schedule</h1>
          <p className="text-muted-foreground">Cross-platform distribution pipeline.</p>
        </div>
        <ScheduleModal onScheduled={fetchSchedule} />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Connection Widget */}
        <div className="lg:col-span-1">
          <ConnectSocialsCard />
        </div>

        {/* Schedule View */}
        <div className="lg:col-span-2 space-y-8">
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
            <CardDescription>Your scheduled posts will appear here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-lg border border-dashed">
                <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">No scheduled posts yet.</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Click "Schedule post" to start planning your content.</p>
                <Button variant="outline" size="sm" onClick={() => navigate("/studio")}>Go to Studio</Button>
              </div>
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
                      {p.thumbnail ? (
                        <img src={p.thumbnail} alt="" className="h-full w-full object-cover rounded-md" />
                      ) : (
                        <Video className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.clipTitle}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Share2 className="h-3 w-3" />
                        {p.platform}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={async () => {
                          if (confirm("Cancel this scheduled post?")) {
                            const res = await api.deleteScheduledPost(p.id);
                            if (res.success) {
                              toast.success("Post cancelled");
                              fetchSchedule();
                            } else {
                              toast.error(res.error || "Failed to cancel");
                            }
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Badge variant="outline">{p.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
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
      </div>
    </AppLayout>
  );
}
