import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/layout/AppLayout";
import { GradientText } from "@/components/cinematic/GradientText";
import { Loader2, Play, RefreshCw, AlertCircle, CheckCircle, Clock, ArrowLeft, Film } from "lucide-react";
import { cn } from "@/lib/utils";

interface AiRender {
  id: string;
  status: "queued" | "processing" | "done" | "error";
  script: string | null;
  voiceId: string | null;
  outputUrl: string | null;
  error: string | null;
  progress: number;
  createdAt: string;
}

export function AiVideoRendersPage() {
  const navigate = useNavigate();
  const [renders, setRenders] = useState<AiRender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRenders = async () => {
    setLoading(true);
    try {
      const res = await api.getAiVideoRenders();
      if (res.success && res.data) {
        setRenders(res.data);
      } else {
        setError(res.error || "Failed to load renders");
      }
    } catch {
      setError("Failed to load renders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRenders();
  }, []);

  // Poll active renders every 5s
  useEffect(() => {
    const hasActive = renders.some((r) => r.status === "queued" || r.status === "processing");
    if (!hasActive) return;
    const interval = setInterval(fetchRenders, 5000);
    return () => clearInterval(interval);
  }, [renders]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "done": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error": return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "processing": return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">
              <GradientText>AI Video Renders</GradientText>
            </h1>
            <p className="text-muted-foreground mt-1">Track and manage your cloud-rendered videos.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchRenders} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => navigate("/studio/ai-video")}>
              <Film className="h-4 w-4 mr-1.5" />
              New Video
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading && renders.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : renders.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Film className="h-12 w-12 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground">No renders yet.</p>
            <Button onClick={() => navigate("/studio/ai-video")}>Create Your First AI Video</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {renders.map((render) => (
              <div
                key={render.id}
                className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
              >
                <div className="shrink-0">{statusIcon(render.status)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {render.script ? render.script.slice(0, 80) + "..." : "Untitled Render"}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground capitalize">{render.status}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(render.createdAt).toLocaleString()}
                    </span>
                    {render.status === "processing" && (
                      <span className="text-xs text-primary">{render.progress}%</span>
                    )}
                  </div>
                  {render.status === "processing" && (
                    <div className="w-full h-1 bg-muted rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${render.progress}%` }}
                      />
                    </div>
                  )}
                  {render.error && (
                    <p className="text-xs text-red-400 mt-1">{render.error}</p>
                  )}
                </div>
                <div className="shrink-0">
                  {render.status === "done" && render.outputUrl ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={render.outputUrl} target="_blank" rel="noopener noreferrer">
                        <Play className="h-4 w-4 mr-1.5" />
                        Watch
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled>
                      <Clock className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
