import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import ReactPlayer from "react-player";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Sparkles,
  Zap,
  Play,
  Pause,
  Save,
  CheckCircle,
  Video,
  ChevronRight,
  TrendingUp,
  Clock,
  ArrowLeft,
  Info,
  Copy,
  RefreshCw,
  Link2,
  AlertTriangle,
  Type,
  Scissors,
  Film,
  Laugh,
  BookOpen,
  Heart,
  Flame,
  Mic,
} from "lucide-react";
import { api, type Clip } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useBrowserTranscribe } from "@/hooks/use-browser-transcribe";

interface Suggestion {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  durationSeconds: number;
  viralScore: number;
  reasoning: string;
  caption: string;
  clipId?: string;
  jobId?: string;
  renderStatus?: "pending" | "ready" | "failed";
  videoUrl?: string;
  renderAttempts?: number;
  renderError?: string;
}

export function StudioGeneratorPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(!!videoId);
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>("Initializing AI…");
  const [selectingId, setSelectingId] = useState<string | null>(null);

  // Landing state (no videoId)
  const [pasteUrl, setPasteUrl] = useState("");
  const [importing, setImporting] = useState(false);

  // Clip configuration
  const [selectedLength, setSelectedLength] = useState<number>(60);
  const [selectedClipType, setSelectedClipType] = useState<string>("viral");
  const [hasStarted, setHasStarted] = useState(false);

  // Manual transcript input
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  const [manualTranscript, setManualTranscript] = useState("");
  const [isBrowserTranscribing, setIsBrowserTranscribing] = useState(false);
  const browserTranscribe = useBrowserTranscribe();

  const handlePasteTranscript = async () => {
    if (!manualTranscript.trim() || !video) return;
    try {
      const res = await api.updateTranscript(video.id, manualTranscript.trim());
      if (res.success) {
        toast.success("Transcript saved! Starting AI analysis…");
        setShowTranscriptInput(false);
        video.transcript = manualTranscript.trim();
        await handleStartGeneration(video, {
          targetLength: selectedLength,
          clipType: selectedClipType,
        });
      } else {
        toast.error(res.error || "Failed to save transcript");
      }
    } catch (e: any) {
      console.error("[generator] Failed to save manual transcript:", e);
      toast.error(e.message || "Failed to save transcript");
    }
  };

  // Player state
  const playerRef = useRef<ReactPlayer>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  // Poll render jobs
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!videoId) return;
    void (async () => {
      try {
        const res = await api.getVideo(videoId);
        if (res.success && res.data) {
          setVideo(res.data);
          // Don't auto-start — let user configure length/type first
        } else {
          toast.error("Video not found");
          navigate("/studio/videos");
        }
      } catch {
        toast.error("Failed to load video");
      } finally {
        setLoading(false);
      }
    })();
  }, [videoId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Sync browser transcription progress to page progress bar
  useEffect(() => {
    if (isBrowserTranscribing) {
      setProgress(browserTranscribe.progress);
      setStatus(browserTranscribe.stageLabel);
    }
  }, [isBrowserTranscribing, browserTranscribe.progress, browserTranscribe.stageLabel]);

  const startPollingJobs = useCallback((hooks: Suggestion[]) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      const jobsToPoll = hooks.filter(h => h.jobId && h.renderStatus !== "ready" && h.renderStatus !== "failed");
      if (jobsToPoll.length === 0) {
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }

      await Promise.all(jobsToPoll.map(async (hook) => {
        if (!hook.jobId) return;
        try {
          const res = await api.getRenderJob(hook.jobId);
          if (res.success && res.data) {
            setSuggestions(prev => prev.map(s => {
              if (s.id !== hook.id) return s;
              return {
                ...s,
                renderStatus: res.data!.status as "pending" | "ready" | "failed",
                videoUrl: res.data!.videoUrl || s.videoUrl,
                renderAttempts: res.data!.attempts,
                renderError: res.data!.error || undefined,
              };
            }));
          }
        } catch {
          // Ignore polling errors
        }
      }));
    }, 2000);
  }, []);

  const handleStartGeneration = async (
    v: any,
    options?: { manualTranscript?: string; targetLength?: number; clipType?: string }
  ) => {
    setGenerating(true);
    setSuggestions([]);
    setProgress(10);
    setHasStarted(true);
    if (pollRef.current) clearInterval(pollRef.current);

    const targetLength = options?.targetLength ?? selectedLength;
    const clipType = options?.clipType ?? selectedClipType;

    // Use manually pasted transcript if provided
    if (options?.manualTranscript) {
      v.transcript = options.manualTranscript;
    }

    // Get transcript — try browser AI for uploads, poll server for YouTube URLs
    if (!v.transcript) {
      const isUpload = v.sourceType === "upload" || v.videoFileUrl;

      if (isUpload) {
        // Browser transcription for uploaded videos
        setStatus("Transcribing with browser AI…");
        setIsBrowserTranscribing(true);
        try {
          const result = await browserTranscribe.transcribe(v.url, v.id);
          if (result) {
            v.transcript = result;
          }
        } catch (e: any) {
          console.error("[generator] Browser transcription failed:", e);
        }
        setIsBrowserTranscribing(false);
        if (!v.transcript) {
          setGenerating(false);
          setProgress(0);
          setStatus("Transcript unavailable.");
          toast.error(
            "Browser transcription failed. You can paste the transcript manually below.",
            { duration: 10000 }
          );
          setShowTranscriptInput(true);
          return;
        }
      } else {
        // Server transcription for YouTube URLs
        setStatus("Transcribing video…");
        let attempts = 0;
        const maxAttempts = 20; // ~60 seconds
        while (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const fresh = await api.getVideo(v.id);
            if (fresh.success && fresh.data?.transcript) {
              v.transcript = fresh.data.transcript;
              break;
            }
          } catch (e) {
            console.error("[generator] Failed to fetch video status during poll:", e);
          }
          attempts++;
          setProgress(10 + Math.min(40, attempts * 2));
        }
        if (!v.transcript) {
          setGenerating(false);
          setProgress(0);
          setStatus("Transcript unavailable.");
          console.error("[generator] Transcript still null after", maxAttempts, "polling attempts for video", v.id);
          toast.error(
            "YouTube is blocking automated video downloads from our servers. Please paste the transcript manually — click the video on YouTube, open the transcript panel (⋯ → Show transcript), copy it, and paste it below.",
            { duration: 45000 }
          );
          setShowTranscriptInput(true);
          return;
        }
      }
    }

    setStatus("Analyzing video transcript…");
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p < 90) return p + 2;
        return p;
      });
    }, 1500);

    try {
      const res = await api.generateHooks(v.url, v.id, true, targetLength, clipType); // true = preRender
      if (res.success && res.data) {
        const mapped = res.data.map((s: any, i: number) => ({
          ...s,
          id: s.id || `suggest-${i}-${Date.now()}`,
          durationSeconds: s.durationSeconds || (s.endSec - s.startSec) || 0,
          viralScore: s.viralScore || s.viral_score || 0,
          title: s.title || s.concept || `Viral Moment ${i + 1}`,
          clipId: s.clipId,
          jobId: s.jobId,
          renderStatus: s.jobId ? "pending" : undefined,
        }));
        setSuggestions(mapped);
        setProgress(100);
        setStatus("Generation complete! Rendering previews…");
        toast.success(`AI found ${res.data.length} high-potential clips! Rendering previews now…`);
        startPollingJobs(mapped);
      } else {
        throw new Error(res.error || "Generation failed");
      }
    } catch (err: any) {
      toast.error(err.message || "AI was unable to process this video.");
      setStatus("Error during generation.");
      setProgress(0);
    } finally {
      clearInterval(interval);
      setGenerating(false);
    }
  };

  const handleImportAndGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pasteUrl.trim();
    if (!trimmed) return;
    setImporting(true);
    toast.info("Importing video…");
    try {
      const res = await api.importLink(trimmed);
      if (res.success && res.data) {
        navigate(`/studio/generator/${res.data.id}`);
      } else {
        toast.error(res.error ?? "Failed to import video");
        setImporting(false);
      }
    } catch {
      toast.error("Failed to import video");
      setImporting(false);
    }
  };

  const handlePreview = (s: Suggestion) => {
    setPreviewingId(s.id);
    playerRef.current?.seekTo(s.startSec, "seconds");
    setPlaying(true);
  };

  const handleSelectClip = async (suggestion: Suggestion) => {
    if (!suggestion.clipId) return;
    setSelectingId(suggestion.id);
    try {
      const res = await api.selectClip(suggestion.clipId);
      if (res.success && res.data) {
        toast.success("Clip saved to your library!");
        navigate(`/studio/editor/${suggestion.clipId}`);
      } else {
        throw new Error(res.error || "Failed to select clip");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to select clip. Please try again.");
      setSelectingId(null);
    }
  };

  const handleCopyTranscript = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Transcript copied to clipboard");
  };

  // ─── Loading state (fetching video from DB) ────────────────────────────────
  if (loading) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#5865F2]" />
        </div>
      </AppLayout>
    );
  }

  // ─── Landing state (no videoId provided) ──────────────────────────────────
  if (!videoId && !video) {
    return (
      <AppLayout container contentClassName="max-w-2xl space-y-8 pb-20 pt-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <Sparkles className="h-7 w-7 text-[#5865F2]" />
            AI Clip Generator
          </h1>
          <p className="text-muted-foreground">
            Paste a video link below or choose from your imported library.
          </p>
        </div>

        {/* AI Methodology */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-white/30">AI Methodology</h3>
          <div className="space-y-3">
            {[
              { icon: TrendingUp, label: "Engagement Prediction", desc: "Hooks analyzed for retention likelihood." },
              { icon: Zap, label: "Contextual Slicing", desc: "Clips cut to preserve narrative flow." },
              { icon: Sparkles, label: "Viral Pattern Match", desc: "Compared against trending short-form data." },
            ].map((m, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  <m.icon className="h-4 w-4 text-white/40" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/70">{m.label}</p>
                  <p className="text-[10px] text-white/40">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* URL input */}
        <form onSubmit={handleImportAndGenerate} className="space-y-3">
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="Paste YouTube, TikTok, or any video link…"
              className="pl-11 h-12 bg-card border-white/10 focus:border-primary/50 text-base"
              disabled={importing}
            />
          </div>
          <Button
            type="submit"
            className="w-full h-12 btn-gradient font-bold text-base"
            disabled={importing || !pasteUrl.trim()}
          >
            {importing ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Sparkles className="h-5 w-5 mr-2" />}
            {importing ? "Importing & Analyzing…" : "Generate Viral Clips"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10" /></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or choose from library</span></div>
        </div>

        <Button variant="outline" className="w-full" onClick={() => navigate("/studio/videos")}>
          <Video className="h-4 w-4 mr-2" />
          My Videos
        </Button>
      </AppLayout>
    );
  }

  const readyCount = suggestions.filter(s => s.renderStatus === "ready").length;
  const pendingCount = suggestions.filter(s => s.renderStatus === "pending").length;

  return (
    <AppLayout container contentClassName="max-w-6xl space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <button onClick={() => navigate("/studio/videos")} className="hover:text-foreground transition-colors flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> My Videos
            </button>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground font-medium">AI Clip Generator</span>
          </div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <Sparkles className="h-7 w-7 text-[#5865F2]" />
            AI Clip Generator
          </h1>
          <p className="text-muted-foreground">
            Analyzing: <span className="text-foreground font-semibold">{video?.title || "your video"}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate("/studio/videos")}>Cancel</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Source Preview & Progress */}
        <div className="lg:col-span-1 space-y-6">
          {/* AI Methodology */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-white/30">AI Methodology</h3>
            <div className="space-y-3">
              {[
                { icon: TrendingUp, label: "Engagement Prediction", desc: "Hooks analyzed for retention likelihood." },
                { icon: Zap, label: "Contextual Slicing", desc: "Clips cut to preserve narrative flow." },
                { icon: Sparkles, label: "Viral Pattern Match", desc: "Compared against trending short-form data." },
              ].map((m, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <m.icon className="h-4 w-4 text-white/40" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white/70">{m.label}</p>
                    <p className="text-[10px] text-white/40">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Clip Configuration Panel */}
          {!hasStarted && (
            <Card className="border-border/60 shadow-xl bg-card/80 backdrop-blur-sm overflow-hidden">
              <div className="p-5 space-y-5">
                <div className="flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-[#5865F2]" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-white/50">Clip Settings</h3>
                </div>

                {/* Length Selector */}
                <div className="space-y-2.5">
                  <label className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
                    <Clock className="h-3 w-3" /> Target Length
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 30, label: "30s" },
                      { value: 60, label: "60s" },
                      { value: 90, label: "90s" },
                      { value: 180, label: "3 min" },
                      { value: 300, label: "5 min" },
                      { value: 600, label: "10 min" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedLength(opt.value)}
                        className={cn(
                          "px-2 py-2 rounded-lg text-xs font-bold transition-all border",
                          selectedLength === opt.value
                            ? "bg-[#5865F2]/20 border-[#5865F2]/50 text-[#5865F2]"
                            : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Type Selector */}
                <div className="space-y-2.5">
                  <label className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
                    <Type className="h-3 w-3" /> Clip Vibe
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "viral", label: "Viral", icon: TrendingUp },
                      { value: "cinematic", label: "Cinematic", icon: Film },
                      { value: "funny", label: "Funny", icon: Laugh },
                      { value: "educational", label: "Educational", icon: BookOpen },
                      { value: "emotional", label: "Emotional", icon: Heart },
                      { value: "controversial", label: "Hot Take", icon: Flame },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedClipType(opt.value)}
                        className={cn(
                          "px-2 py-2 rounded-lg text-xs font-bold transition-all border flex flex-col items-center gap-1",
                          selectedClipType === opt.value
                            ? "bg-[#5865F2]/20 border-[#5865F2]/50 text-[#5865F2]"
                            : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70"
                        )}
                      >
                        <opt.icon className="h-3.5 w-3.5" />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full btn-gradient font-bold"
                  onClick={() => handleStartGeneration(video, { targetLength: selectedLength, clipType: selectedClipType })}
                  disabled={generating}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Clips
                </Button>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden border-border/60 shadow-xl bg-black/40 backdrop-blur-sm">
            <div className="aspect-video relative bg-black">
              <ReactPlayer
                ref={playerRef}
                url={video?.url}
                playing={playing}
                controls
                width="100%"
                height="100%"
                onProgress={({ playedSeconds }) => {
                  if (previewingId) {
                    const current = suggestions.find(s => s.id === previewingId);
                    if (current && playedSeconds >= current.endSec) {
                      setPlaying(false);
                    }
                  }
                }}
              />
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider opacity-60">Source Footage</Badge>
                <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                  <Clock className="h-3 w-3" /> {video?.duration || "N/A"}
                </div>
              </div>

              {generating && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-500">
                  <div className="flex items-center justify-between text-xs sm:text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin text-[#5865F2]" />
                      {status}
                    </span>
                    <span className="text-[#5865F2]">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2 bg-white/5" indicatorClassName="bg-[#5865F2] shadow-[0_0_10px_rgba(88,101,242,0.5)]" />
                </div>
              )}

              {!generating && suggestions.length > 0 && (
                <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-green-400">Analysis Complete</p>
                    <p className="text-xs text-green-500/70">
                      {readyCount === suggestions.length
                        ? "All previews rendered! Pick your favorite."
                        : `${readyCount}/${suggestions.length} previews ready. ${pendingCount > 0 ? `${pendingCount} still rendering…` : ""}`}
                    </p>
                  </div>
                </div>
              )}

              {/* Generate Again button */}
              {!generating && suggestions.length > 0 && (
                <Button
                  variant="outline"
                  className="w-full gap-2 border-white/10 text-white/60 hover:text-white hover:border-white/30"
                  onClick={() => handleStartGeneration(video, { targetLength: selectedLength, clipType: selectedClipType })}
                >
                  <RefreshCw className="h-4 w-4" />
                  Generate Again
                </Button>
              )}

              {/* Manual transcript fallback */}
              {showTranscriptInput && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-500">
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-xs text-amber-400 font-semibold mb-1">
                      {video?.sourceType === "upload" ? "Browser transcription failed" : "YouTube is blocking auto-transcription"}
                    </p>
                    <p className="text-[10px] text-amber-500/80 leading-relaxed">
                      {video?.sourceType === "upload"
                        ? "The AI couldn't transcribe this upload automatically. You can try again or paste the transcript manually."
                        : "Due to YouTube restrictions, our servers can't download videos for transcription right now. You can still generate clips by pasting the transcript manually."}
                    </p>
                  </div>
                  {video?.sourceType === "upload" && (
                    <Button
                      variant="outline"
                      className="w-full border-[#5865F2]/30 text-[#5865F2] hover:bg-[#5865F2]/10 gap-2"
                      onClick={() => {
                        setShowTranscriptInput(false);
                        handleStartGeneration(video, { targetLength: selectedLength, clipType: selectedClipType });
                      }}
                    >
                      <Mic className="h-4 w-4" />
                      Retry Browser Transcription
                    </Button>
                  )}
                  <div className="rounded-lg bg-white/5 p-3 space-y-1.5">
                    <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">How to get the transcript</p>
                    <ol className="text-[10px] text-white/50 space-y-0.5 list-decimal list-inside">
                      <li>Open the video on <strong className="text-white/70">YouTube</strong></li>
                      <li>Click <strong className="text-white/70">⋯ (More)</strong> below the video</li>
                      <li>Select <strong className="text-white/70">Show transcript</strong></li>
                      <li>Click <strong className="text-white/70">⋮</strong> in the transcript panel → <strong className="text-white/70">Toggle timestamps</strong> (off)</li>
                      <li>Select all text (Ctrl+A / Cmd+A) and copy</li>
                      <li>Paste it below and click <strong className="text-white/70">Analyze Transcript</strong></li>
                    </ol>
                  </div>
                  <textarea
                    value={manualTranscript}
                    onChange={(e) => setManualTranscript(e.target.value)}
                    placeholder="Paste video transcript here…"
                    className="w-full h-32 bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:border-[#5865F2]/50"
                  />
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 btn-gradient text-xs"
                      onClick={handlePasteTranscript}
                      disabled={!manualTranscript.trim()}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Analyze Transcript
                    </Button>
                    <Button
                      variant="outline"
                      className="text-xs border-white/10"
                      onClick={() => setShowTranscriptInput(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right: Generated Clips */}
        <div className="lg:col-span-2 space-y-6">
          {!generating && suggestions.length === 0 && (
            <div className="h-[400px] rounded-3xl border-2 border-dashed border-white/5 flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <Video className="h-8 w-8 text-white/20" />
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  {hasStarted ? "No clips found" : "Ready to Generate"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  {hasStarted
                    ? "The AI couldn't find suitable clips with the current settings. Try a different length or vibe."
                    : "Configure your clip settings on the left, then click Generate Clips to start the AI analysis."}
                </p>
                {!hasStarted && (
                  <p className="text-[10px] text-amber-500/60 max-w-xs mx-auto mt-1">
                    YouTube sometimes blocks automated transcription. If that happens, you can paste the transcript manually — no worries.
                  </p>
                )}
              </div>
              {hasStarted && (
                <Button
                  variant="outline"
                  className="border-white/10 text-white/60 hover:text-white"
                  onClick={() => { setHasStarted(false); setSuggestions([]); }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Adjust Settings
                </Button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {suggestions.map((s, idx) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className={cn(
                  "relative group border border-border/60 overflow-hidden transition-all duration-300",
                  selectingId === s.id ? "bg-[#5865F2]/5 border-[#5865F2]/40" : "bg-card hover:border-border"
                )}>
                  <div className="flex flex-col md:flex-row">
                    {/* Video / Thumbnail Area */}
                    <div className="w-full md:w-64 shrink-0 relative aspect-[9/16] md:aspect-auto bg-black overflow-hidden">
                      {s.renderStatus === "ready" && s.videoUrl ? (
                        <ReactPlayer
                          url={s.videoUrl}
                          playing={previewingId === s.id && playing}
                          controls
                          width="100%"
                          height="100%"
                          style={{ position: "absolute", top: 0, left: 0 }}
                          onEnded={() => setPlaying(false)}
                        />
                      ) : (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-[1]" />
                          <div className="absolute inset-0 flex items-center justify-center z-[2]">
                            {s.renderStatus === "pending" ? (
                              <div className="text-center space-y-2">
                                <Loader2 className="h-8 w-8 animate-spin text-[#5865F2] mx-auto" />
                                <p className="text-[10px] font-mono text-white/50">
                                  Rendering… {s.renderAttempts ? `(attempt ${s.renderAttempts})` : ""}
                                </p>
                              </div>
                            ) : s.renderStatus === "failed" ? (
                              <div className="absolute inset-0 z-[3]">
                                {/* Fallback: show source video at hook start time */}
                                <ReactPlayer
                                  url={video?.url}
                                  playing={previewingId === s.id && playing}
                                  controls
                                  width="100%"
                                  height="100%"
                                  style={{ position: "absolute", top: 0, left: 0 }}
                                  onReady={() => playerRef.current?.seekTo(s.startSec, "seconds")}
                                  onEnded={() => setPlaying(false)}
                                />
                                <div className="absolute top-2 left-2 z-10">
                                  <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-[9px]">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Render failed — showing source
                                  </Badge>
                                </div>
                                {s.renderError && (
                                  <div className="absolute bottom-2 left-2 right-2 z-10">
                                    <p className="text-[9px] font-mono text-red-300/60 bg-black/60 rounded px-2 py-1 truncate">
                                      {s.renderError}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center space-y-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md"
                                  onClick={() => handlePreview(s)}
                                >
                                  {previewingId === s.id && playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                                </Button>
                                <p className="text-[10px] font-mono text-white/50">{fmt(s.startSec)} - {fmt(s.endSec)}</p>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                      <Badge className="absolute bottom-2 right-2 bg-black/60 text-white border-white/10 text-[10px]">
                        {s.durationSeconds}s
                      </Badge>
                    </div>

                    <div className="flex-1 p-5 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <h4 className="font-bold text-lg text-white leading-tight">{s.title}</h4>
                          <p className="text-xs text-[#5865F2]/80 font-semibold flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> Viral Potential: {s.viralScore}%
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-white/30 hover:text-white" onClick={() => handleCopyTranscript(s.caption)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                        <p className="text-[11px] font-medium text-white/40 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                          <Info className="h-3 w-3" /> Transcribed Hook
                        </p>
                        <p className="text-xs text-white/60 leading-relaxed italic">
                          "{s.caption}"
                        </p>
                      </div>

                      <p className="text-xs text-white/30 leading-relaxed line-clamp-2">
                        {s.reasoning}
                      </p>

                      {/* Action Button */}
                      <div className="pt-1">
                        {s.renderStatus === "ready" ? (
                          <Button
                            className="btn-gradient shadow-[0_0_15px_rgba(88,101,242,0.3)] w-full md:w-auto"
                            onClick={() => handleSelectClip(s)}
                            disabled={selectingId !== null}
                          >
                            {selectingId === s.id ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Save className="h-4 w-4 mr-2" />
                            )}
                            {selectingId === s.id ? "Saving…" : "Use This Clip"}
                          </Button>
                        ) : s.renderStatus === "failed" ? (
                          <Button
                            variant="outline"
                            className="w-full md:w-auto border-red-500/30 text-red-400 hover:bg-red-500/10"
                            onClick={() => handleSelectClip(s)}
                          >
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            Use Anyway (Source Video)
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="w-full md:w-auto border-white/10 text-white/40"
                            disabled
                          >
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Rendering Preview…
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          <AnimatePresence>
            {suggestions.length > 0 && readyCount > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between p-6 rounded-3xl bg-gradient-to-r from-[#5865F2]/10 to-[#00D4AA]/10 border border-white/10"
              >
                <div>
                  <p className="text-sm font-bold text-white">Pick your favorite</p>
                  <p className="text-xs text-white/50">
                    {readyCount === suggestions.length
                      ? "All previews are ready. Choose one to edit and export."
                      : `${readyCount} of ${suggestions.length} ready. You can select now or wait for the rest.`}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AppLayout>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
