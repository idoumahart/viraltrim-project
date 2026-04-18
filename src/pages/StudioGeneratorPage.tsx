import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import ReactPlayer from "react-player";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Sparkles,
  Zap,
  Play,
  Pause,
  Save,
  Trash2,
  CheckCircle,
  Video,
  ChevronRight,
  TrendingUp,
  Clock,
  ArrowLeft,
  Info,
  Download,
  Copy,
  RefreshCw,
  Link2,
} from "lucide-react";
import { api, type Clip } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Suggestion {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  durationSeconds: number;
  viralScore: number;
  reasoning: string;
  caption: string;
  selected?: boolean;
}

export function StudioGeneratorPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(!!videoId); // only show loader if we have a videoId
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>("Initializing AI...");
  const [saving, setSaving] = useState(false);

  // Landing state (no videoId)
  const [pasteUrl, setPasteUrl] = useState("");
  const [importing, setImporting] = useState(false);

  // Player state
  const playerRef = useRef<ReactPlayer>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!videoId) return;
    void (async () => {
      try {
        const res = await api.getVideo(videoId);
        if (res.success && res.data) {
          setVideo(res.data);
          handleStartGeneration(res.data);
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

  const handleStartGeneration = async (v: any) => {
    setGenerating(true);
    setSuggestions([]);
    setProgress(10);
    setStatus("Analyzing video transcript…");

    const interval = setInterval(() => {
      setProgress((p) => {
        if (p < 90) return p + 2;
        return p;
      });
    }, 1500);

    try {
      const res = await api.generateHooks(v.url, v.id);
      if (res.success && res.data) {
        setSuggestions(res.data.map((s: any, i: number) => ({
          ...s,
          id: s.id || `suggest-${i}-${Date.now()}`,
          durationSeconds: s.durationSeconds || (s.endSec - s.startSec) || 0,
          viralScore: s.viralScore || s.viral_score || 0,
          title: s.title || s.concept || `Viral Moment ${i + 1}`,
          selected: true,
        })));
        setProgress(100);
        setStatus("Generation complete!");
        toast.success(`AI found ${res.data.length} high-potential clips!`);
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

  const handleToggleSelect = (id: string) => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const handlePreview = (s: Suggestion) => {
    setPreviewingId(s.id);
    playerRef.current?.seekTo(s.startSec, "seconds");
    setPlaying(true);
  };

  const handleSaveSelected = async () => {
    const selected = suggestions.filter(s => s.selected);
    if (selected.length === 0) {
      toast.error("Please select at least one clip to save.");
      return;
    }
    if (!video) {
      toast.error("Source video lost. Please refresh.");
      return;
    }
    setSaving(true);
    toast.info(`Saving ${selected.length} clips to your library…`);
    try {
      let savedCount = 0;
      for (const s of selected) {
        const res = await api.generateClip({
          source_url: video.url,
          source_channel: video.title || "ViralTrim",
          requested_start_seconds: s.startSec,
          requested_end_seconds: s.endSec,
          title: s.title || s.concept || "Viral Clip",
          viralScore: s.viralScore,
        });
        if (res.success) savedCount++;
      }
      toast.success(`Successfully saved ${savedCount} clips!`);
      navigate("/studio/clips");
    } catch {
      toast.error("Failed to save some clips. Please try again.");
    } finally {
      setSaving(false);
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

  const selectedCount = suggestions.filter(s => s.selected).length;

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
          <Button
            className="btn-gradient px-6 font-bold"
            onClick={handleSaveSelected}
            disabled={saving || generating || selectedCount === 0}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save {selectedCount} Clips
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Source Preview & Progress */}
        <div className="lg:col-span-1 space-y-6">
          {/* AI Methodology — shown at top of left column */}
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
                    <p className="text-xs text-green-500/70">Found {suggestions.length} viral hooks with high potential.</p>
                  </div>
                </div>
              )}

              {/* Generate Again button */}
              {!generating && suggestions.length > 0 && (
                <Button
                  variant="outline"
                  className="w-full gap-2 border-white/10 text-white/60 hover:text-white hover:border-white/30"
                  onClick={() => handleStartGeneration(video)}
                >
                  <RefreshCw className="h-4 w-4" />
                  Generate Again
                </Button>
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
                <h3 className="text-lg font-bold">Ready to Generate</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">AI will analyze the transcript and find the best viral moments for you.</p>
              </div>
              <Button className="btn-gradient" onClick={() => handleStartGeneration(video)}>
                Run AI Analysis
              </Button>
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
                  s.selected ? "bg-[#5865F2]/5 border-[#5865F2]/40" : "bg-card hover:border-border"
                )}>
                  <div className="absolute top-4 left-4 z-10">
                    <Checkbox
                      checked={s.selected}
                      onCheckedChange={() => handleToggleSelect(s.id)}
                      className="h-5 w-5 rounded border-white/20 data-[state=checked]:bg-[#5865F2] data-[state=checked]:border-[#5865F2]"
                    />
                  </div>

                  <div className="flex flex-col md:flex-row">
                    <div className="w-full md:w-56 shrink-0 relative aspect-video md:aspect-auto bg-black flex items-center justify-center">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-[1]" />
                      <div className="z-[2] text-center space-y-1">
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
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between p-6 rounded-3xl bg-gradient-to-r from-[#5865F2]/10 to-[#00D4AA]/10 border border-white/10"
              >
                <div>
                  <p className="text-sm font-bold text-white">Ready to proceed?</p>
                  <p className="text-xs text-white/50">You've selected {selectedCount} viral moments to save.</p>
                </div>
                <Button className="btn-gradient shadow-[0_0_20px_rgba(88,101,242,0.4)]" onClick={handleSaveSelected} disabled={saving || selectedCount === 0}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Save Selected Clips
                </Button>
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
