import React, { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Search, Scissors, Loader2 } from "lucide-react";
import { api, type Clip } from "@/lib/api-client";
import { toast } from "sonner";

export default function ClipsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClips = async () => {
      try {
        const res = await api.getClips();
        if (res.success && res.data) {
          setClips(res.data);
        } else {
          toast.error(res.error || "Failed to load clip library");
        }
      } catch {
        toast.error("Network error");
      } finally {
        setLoading(false);
      }
    };
    void fetchClips();
  }, []);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) {
      return clips;
    }
    return clips.filter((c) => c.title.toLowerCase().includes(q) || c.platform.toLowerCase().includes(q));
  }, [clips, searchTerm]);

  return (
    <AppLayout container contentClassName="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Clip library</h1>
          <p className="text-muted-foreground">All generated clips for your account.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Filter…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((clip) => (
            <Card key={clip.id} className="border-border/80">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <CardTitle className="text-lg truncate">{clip.title}</CardTitle>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <Scissors className="h-3 w-3" />
                    {clip.platform} · {clip.duration ?? "—"}
                  </p>
                </div>
                <Badge className={cn(clip.status === "posted" && "bg-primary")}>{clip.status}</Badge>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
      {!loading && filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clips yet. Run discovery and generate in the studio.</p>
      ) : null}
    </AppLayout>
  );
}
