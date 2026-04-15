import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import ReactPlayer from "react-player";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Scissors, Sparkles, Play, Loader2, TrendingUp, Video, AlertCircle } from "lucide-react";
import { api, type ViralVideo } from "@/lib/api-client";
import { toast } from "sonner";

export default function EditorPage() {
  const params = useParams();
  const videoId = params.videoId ? String(params.videoId) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const stateVideo = (location.state as { video?: ViralVideo } | null)?.video;

  const [playing, setPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(30);

  const videoUrl = stateVideo?.url ?? "";
  const channel = stateVideo?.title?.split("—")[0]?.trim() ?? "Trending topic";

  // No strict redirect on missing videoId anymore to allow sidebar navigation
  useEffect(() => {
    if (!videoId && !stateVideo) {
      // Just visually show empty state, no aggressive routing
    }
  }, [videoId, stateVideo]);

  const handleGenerate = useCallback(async () => {
    if (!videoUrl) {
      toast.error("No source URL — open this page from discovery.");
      return;
    }
    const duration = endSec - startSec;
    if (duration > 90) {
      toast.error("Clip cannot exceed 90 seconds");
      return;
    }
    setIsProcessing(true);
    setProgress(10);
    try {
      const res = await api.generateClip({
        source_url: videoUrl,
        source_channel: channel,
        requested_start_seconds: startSec,
        requested_end_seconds: endSec,
      });
      setProgress(100);
      if (res.success && res.data) {
        toast.success("Clip generated");
        navigate("/clips");
      } else {
        toast.error(res.error || "Generation failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setIsProcessing(false);
    }
  }, [videoUrl, channel, startSec, endSec, navigate]);

  return (
    <AppLayout container contentClassName="space-y-8">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-display font-bold">Editor studio</h1>
            <Badge variant="secondary">{videoId}</Badge>
          </div>
          <Card className="overflow-hidden border-border/80">
            <div className="aspect-video bg-black">
              {videoUrl ? (
                <ReactPlayer url={videoUrl} playing={playing} controls width="100%" height="100%" />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-6 text-center">
                  <AlertCircle className="h-5 w-5 mr-2 shrink-0" />
                  Open a video from Discovery to load a source URL (YouTube search links work for context).
                </div>
              )}
            </div>
            <CardContent className="p-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPlaying((p) => !p)}>
                <Play className="h-4 w-4 mr-1" />
                {playing ? "Pause" : "Play"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="w-full lg:w-80 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Scissors className="h-4 w-4" />
                Trim (seconds)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="text-xs text-muted-foreground block">
                Start
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  value={startSec}
                  onChange={(e) => setStartSec(Number(e.target.value) || 0)}
                />
              </label>
              <label className="text-xs text-muted-foreground block">
                End (max 90s length)
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  value={endSec}
                  onChange={(e) => setEndSec(Number(e.target.value) || 0)}
                />
              </label>
              <p className="text-xs text-muted-foreground">Length: {Math.max(0, endSec - startSec)}s</p>
              {endSec - startSec > 90 ? (
                <p className="text-xs text-destructive">Exceeds 90s — adjust range.</p>
              ) : null}
            </CardContent>
          </Card>

          <motion.div whileHover={{ scale: 1.01 }}>
            <Button
              className="w-full btn-gradient gap-2"
              disabled={isProcessing}
              onClick={() => void handleGenerate()}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate clip (AI)
            </Button>
          </motion.div>
          {isProcessing ? <Progress value={progress} className="h-2" /> : null}
          <Card className="bg-card/60">
            <CardContent className="pt-4 text-xs text-muted-foreground flex gap-2">
              <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
              Captions will include required credit line for the source channel.
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
