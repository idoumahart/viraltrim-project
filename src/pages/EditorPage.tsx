import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactPlayer from "react-player";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Play, Pause, Save, ArrowLeft, Loader2, Zap, Type,
  Film, Upload, Music, SkipBack, SkipForward, Scissors,
  Volume2, ChevronRight, Maximize2, Sparkles, X,
} from "lucide-react";
import { api, type Clip } from "@/lib/api-client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { CaptionEditor, CaptionOverlay } from "@/components/editor/CaptionEditor";
import { ClipCombiner } from "@/components/editor/ClipCombiner";
import { MediaUploader } from "@/components/editor/MediaUploader";
import { AudioTimeline } from "@/components/editor/AudioTimeline";
import { ScheduleModal } from "@/components/editor/ScheduleModal";
import { AppLayout } from "@/components/layout/AppLayout";

// ─── Constants ────────────────────────────────────────────────────────────────
const EDIT_LIMITS: Record<string, number> = { free: 3, pro: 10, agency: 20, unlimited: 999 };
function editLimitFor(plan: string) { return EDIT_LIMITS[plan.toLowerCase()] ?? 3; }

const TEXT_STYLES = [
  { value: "classic", label: "Classic" },
  { value: "bold", label: "Bold" },
  { value: "glow", label: "Glow" },
  { value: "neon", label: "Neon" },
] as const;

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

type ToolId = "captions" | "audio" | "combine" | "upload" | "enhance";

interface LocationState {
  clip?: Clip & { 
    video_url?: string; // Add snake_case support
    source_url?: string; 
  };
  video?: { 
    id: string; 
    title: string; 
    url?: string; 
    video_url?: string; // Add snake_case support
    thumbnail?: string; 
    duration?: string; 
    viralScore?: number 
  };
}


// ─── Multi-track Timeline ─────────────────────────────────────────────────────
interface TrackTimelineProps {
  duration: number;
  startSec: number;
  endSec: number;
  currentTime: number;
  onStartChange: (s: number) => void;
  onEndChange: (s: number) => void;
  onSeek: (s: number) => void;
  hasAudio: boolean;
  hasCaptions: boolean;
}

function TrackTimeline({
  duration, startSec, endSec, currentTime,
  onStartChange, onEndChange, onSeek, hasAudio, hasCaptions,
}: TrackTimelineProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | "playhead" | null>(null);

  const toPercent = (s: number) => (duration > 0 ? (s / duration) * 100 : 0);
  const toSeconds = useCallback((clientX: number) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
  }, [duration]);

  const onPointerDown = (handle: "start" | "end" | "playhead") => (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = handle;
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const s = toSeconds(e.clientX);
      if (dragging.current === "start") onStartChange(Math.min(Math.round(s), endSec - 1));
      else if (dragging.current === "end") onEndChange(Math.max(Math.round(s), startSec + 1));
      else if (dragging.current === "playhead") onSeek(s);
    };
    const up = () => { dragging.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [toSeconds, startSec, endSec, onStartChange, onEndChange, onSeek]);

  const startPct = toPercent(startSec);
  const endPct = toPercent(endSec);
  const playPct = toPercent(currentTime);

  // Generate tick marks for time ruler
  const ticks: number[] = [];
  if (duration > 0) {
    const step = duration <= 30 ? 5 : duration <= 120 ? 10 : 30;
    for (let t = 0; t <= duration; t += step) ticks.push(t);
  }

  return (
    <div className="select-none px-4 space-y-2 py-3">
      {/* Time ruler */}
      <div ref={railRef} className="relative h-5 cursor-pointer" onClick={(e) => {
        if (dragging.current) return;
        onSeek(toSeconds(e.clientX));
      }}>
        <div className="absolute inset-x-0 bottom-0 h-px bg-white/10" />
        {ticks.map((t) => (
          <div key={t} className="absolute top-0 flex flex-col items-center" style={{ left: `${toPercent(t)}%` }}>
            <span className="text-[9px] text-white/30 font-mono">{fmt(t)}</span>
            <div className="w-px h-2 bg-white/20 mt-auto" />
          </div>
        ))}
        {/* Playhead on ruler */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[#FF3B5C] cursor-ew-resize z-20"
          style={{ left: `${playPct}%` }}
          onPointerDown={onPointerDown("playhead")}
        >
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#FF3B5C] rotate-45 rounded-sm" />
        </div>
      </div>

      {/* Video track */}
      <div className="flex items-center gap-2">
        <div className="w-16 shrink-0 flex items-center gap-1.5">
          <Film className="h-3 w-3 text-white/40" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Video</span>
        </div>
        <div className="flex-1 relative h-9 rounded-md bg-white/5 border border-white/10 overflow-visible">
          {/* Dimmed before start */}
          <div className="absolute inset-y-0 left-0 rounded-l-md bg-black/50" style={{ width: `${startPct}%` }} />
          {/* Active clip region — teal/primary color block */}
          <div
            className="absolute inset-y-1 rounded"
            style={{
              left: `${startPct}%`,
              width: `${endPct - startPct}%`,
              background: "linear-gradient(90deg, rgba(99,179,237,0.35), rgba(129,230,217,0.35))",
              borderLeft: "2px solid #63B3ED",
              borderRight: "2px solid #63B3ED",
            }}
          >
            <div className="h-full flex items-center px-1.5 overflow-hidden">
              <span className="text-[9px] font-mono text-white/70 truncate">{fmt(startSec)} → {fmt(endSec)}</span>
            </div>
          </div>
          {/* Dimmed after end */}
          <div className="absolute inset-y-0 right-0 rounded-r-md bg-black/50" style={{ width: `${100 - endPct}%` }} />

          {/* Playhead line */}
          <div
            className="absolute inset-y-0 w-0.5 bg-[#FF3B5C]/70 pointer-events-none z-10"
            style={{ left: `${playPct}%` }}
          />

          {/* Start drag handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-full rounded-l cursor-ew-resize flex items-center justify-center z-20"
            style={{ left: `${startPct}%`, background: "#63B3ED" }}
            onPointerDown={onPointerDown("start")}
          >
            <div className="w-0.5 h-4 bg-white/70 rounded-full" />
          </div>
          {/* End drag handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-full rounded-r cursor-ew-resize flex items-center justify-center z-20"
            style={{ left: `${endPct}%`, background: "#63B3ED" }}
            onPointerDown={onPointerDown("end")}
          >
            <div className="w-0.5 h-4 bg-white/70 rounded-full" />
          </div>
        </div>
      </div>

      {/* Audio track */}
      {hasAudio && (
        <div className="flex items-center gap-2">
          <div className="w-16 shrink-0 flex items-center gap-1.5">
            <Music className="h-3 w-3 text-purple-400/60" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400/60">Audio</span>
          </div>
          <div className="flex-1 h-7 rounded bg-purple-500/10 border border-purple-500/20 flex items-center px-2 gap-1 overflow-hidden">
            {Array.from({ length: 40 }).map((_, i) => (
              <div key={i} className="w-0.5 bg-purple-400/40 rounded-full shrink-0"
                style={{ height: `${20 + Math.sin(i * 0.8) * 16}%` }} />
            ))}
          </div>
        </div>
      )}

      {/* Caption track */}
      {hasCaptions && (
        <div className="flex items-center gap-2">
          <div className="w-16 shrink-0 flex items-center gap-1.5">
            <Type className="h-3 w-3 text-amber-400/60" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/60">Text</span>
          </div>
          <div
            className="h-6 rounded border border-amber-500/20 bg-amber-500/10 flex items-center px-2"
            style={{ marginLeft: `${startPct}%`, width: `${endPct - startPct}%` }}
          >
            <span className="text-[9px] text-amber-300/70 truncate">Caption overlay</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Editor ──────────────────────────────────────────────────────────────
export default function EditorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { effectivePlan } = useAuth();
  const userPlan = effectivePlan;

  const state = location.state as LocationState | null;
  const incomingClip = state?.clip ?? null;
  const incomingVideo = state?.video ?? null;

  // Player
  const playerRef = useRef<ReactPlayer>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);

  // Resolve playable URL synchronously on first render — check every possible field name
  // so the empty-state guard below sees the URL before any useEffect fires.
  const videoUrl =
    incomingClip?.videoUrl ||
    (incomingClip as any)?.video_url ||
    incomingClip?.sourceUrl ||
    (incomingClip as any)?.source_url ||
    incomingVideo?.url ||
    (incomingVideo as any)?.video_url ||
    "";

  // Clip data
  const [clip, setClip] = useState<Clip | null>(incomingClip);
  const [title, setTitle] = useState(incomingClip?.title ?? incomingVideo?.title ?? "");


  // Editor state
  const [startSec, setStartSec] = useState(incomingClip?.startSec ?? 0);
  const [endSec, setEndSec] = useState(incomingClip?.endSec ?? (incomingClip?.durationSeconds ?? 0));
  const [captionLines, setCaptionLines] = useState<string[]>(
    incomingClip?.captionLines ?? (incomingClip?.caption ? [incomingClip.caption] : [])
  );
  const [combinedClipIds, setCombinedClipIds] = useState<string[]>(incomingClip?.combinedClipIds ?? []);
  const [textStyle, setTextStyle] = useState(incomingClip?.textStyle ?? "classic");
  const [mediaUrls, setMediaUrls] = useState<string[]>(incomingClip?.mediaUrls ?? []);
  const [hasAudio, setHasAudio] = useState(false);

  // UI state
  const [activeTool, setActiveTool] = useState<ToolId | null>("captions");
  const [saving, setSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string>();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleDuration = (d: number) => {
    setDuration(d);
    if (!incomingClip?.endSec) setEndSec(Math.floor(d));
  };
  const handleProgress = ({ playedSeconds }: { playedSeconds: number }) => setCurrentTime(playedSeconds);
  const handleSeek = useCallback((s: number) => {
    playerRef.current?.seekTo(s, "seconds");
    setCurrentTime(s);
  }, []);
  const seekRelative = (delta: number) => handleSeek(Math.max(0, Math.min(duration, currentTime + delta)));

  const saveProgress = async () => {
    if (!clip && !videoUrl) { toast.error("No clip loaded."); return null; }
    const limit = editLimitFor(userPlan);
    if (clip && (clip.editCount ?? 0) >= limit) { setShowUpgradeModal(true); return null; }
    setSaving(true);
    try {
      let targetClipId = clip?.id;
      if (!targetClipId) {
        const res = await api.generateClip({
          source_url: videoUrl,
          source_channel: incomingVideo?.title || "youtube",
          requested_start_seconds: startSec,
          requested_end_seconds: endSec || 30, // Fallback if still 0
        });
        if (res.success && res.data) targetClipId = res.data.id;
        else throw new Error(res.error || "Failed to initialize clip");
      }
      const res = await api.updateClip(targetClipId, { title, startSec, endSec, captionLines, combinedClipIds, textStyle, mediaUrls });
      if (res.success && res.data) { 
        setClip(res.data); 
        return res.data; 
      }
      else {
        toast.error(res.error ?? "Save failed.");
        return null;
      }
    } catch (err: any) {
      toast.error(err.message || "Save failed.");
      return null;
    } finally { setSaving(false); }
  };

  const handleSaveDraft = async () => {
    const res = await saveProgress();
    if (res) toast.success("Draft saved ✓");
  };

  const handleFinishAndSchedule = async () => {
    const savedClip = await saveProgress();
    if (!savedClip) return;

    setIsRendering(true);
    toast.info("Preparing your video for export...", { duration: 3000 });
    
    try {
      const res = await api.renderClip(savedClip.id);
      if (res.success && res.data) {
        setRenderedVideoUrl(res.data.videoUrl);
        setIsScheduleModalOpen(true);
        toast.success("Ready to post!");
      } else {
        throw new Error(res.error || "Rendering failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Could not render video. Try again.");
    } finally {
      setIsRendering(false);
    }
  };

  const handleSchedulePost = async (data: { platform: string; date: Date }) => {
    if (!clip) return;
    const res = await api.schedulePost(clip.id, data.platform, data.date);
    if (!res.success) {
      toast.error(res.error || "Failed to schedule post");
      throw new Error(res.error);
    }
  };

  const handleGenerateHooks = async () => {
    if (!videoUrl) return;
    setIsGenerating(true);
    try {
      toast.info("AI analyzing your clip…");
      const res = await api.generateClip({
        source_url: videoUrl,
        source_channel: incomingVideo?.title || clip?.platform || "youtube",
        requested_start_seconds: startSec,
        requested_end_seconds: endSec,
      });
      if (res.success && res.data) {
        toast.success("AI hooks generated!");
        if (res.data.captionLines?.length) setCaptionLines(res.data.captionLines);
        else if (res.data.caption) setCaptionLines([res.data.caption]);
        if (res.data.startSec !== undefined) setStartSec(res.data.startSec);
        if (res.data.endSec !== undefined) setEndSec(res.data.endSec);
        handleSeek(res.data.startSec || startSec);
        setPlaying(true);
      } else throw new Error(res.error || "Generation failed.");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate hooks.");
    } finally { setIsGenerating(false); }
  };

  // ── Empty state: no clip object AND no video AND no URL
  if (!clip && !incomingVideo && !videoUrl) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center bg-[#111114]">
          <div className="flex flex-col items-center gap-5 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Film className="h-8 w-8 text-white/20" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-2">No clip loaded</h2>
              <p className="text-sm text-white/40 max-w-xs">Open a clip from My Videos, your Clip Library, or discover one in Viral Search.</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/5" onClick={() => navigate("/studio/videos")}>My Videos</Button>
              <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/5" onClick={() => navigate("/studio/clips")}>My Clips</Button>
              <Button className="bg-[#5865F2] hover:bg-[#4752C4] text-white" onClick={() => navigate("/discovery")}>
                <Sparkles className="h-4 w-4 mr-2" /> Viral Search
              </Button>
            </div>
            <Button variant="ghost" className="text-white/30 text-xs" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-3 w-3 mr-1" /> Go back
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── Clip exists but has no playable URL — show a clear error (not a blank/stuck screen)
  if (clip && !videoUrl) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center bg-[#111114]">
          <div className="flex flex-col items-center gap-5 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Film className="h-8 w-8 text-amber-400/60" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Video unavailable</h2>
              <p className="text-sm text-white/40 max-w-xs">
                This clip's source video could not be found. It may have been deleted or the URL has expired.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/5" onClick={() => navigate("/studio/clips")}>Back to My Clips</Button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }



  const tools: { id: ToolId; icon: React.ElementType; label: string }[] = [
    { id: "captions", icon: Type, label: "Text" },
    { id: "audio", icon: Music, label: "Audio" },
    { id: "enhance", icon: Zap, label: "AI" },
    { id: "combine", icon: Film, label: "Clips" },
    { id: "upload", icon: Upload, label: "Media" },
  ];

  const clipDuration = endSec - startSec;

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-120px)] w-full overflow-hidden bg-[#0E0E11] rounded-2xl border border-white/[0.05] text-white font-sans">
        {/* ── TOP BAR ─────────────────────────────────────────────────────────── */}
        <div className="h-11 shrink-0 border-b border-white/[0.07] bg-[#18181B] flex items-center px-3 gap-3 z-50">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10 rounded-md"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-4 bg-white/10" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent text-sm font-medium text-white/90 outline-none placeholder:text-white/30 min-w-0 flex-1 max-w-[280px]"
            placeholder="Untitled clip…"
          />
          <div className="ml-auto flex items-center gap-2">
            {clip && (
              <Badge className="bg-white/5 border-white/10 text-white/40 text-[10px] font-mono hidden sm:flex">
                {clip.editCount ?? 0}/{editLimitFor(userPlan)} edits
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-white/50 hover:text-white hover:bg-white/10 gap-1.5"
              onClick={handleGenerateHooks}
              disabled={isGenerating || !videoUrl}
            >
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isGenerating ? "Generating…" : "AI Hooks"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-white/50 hover:text-white hover:bg-white/10 gap-1.5"
              onClick={handleSaveDraft}
              disabled={saving || isRendering}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Draft
            </Button>

            <Button
              size="sm"
              className="h-7 text-xs bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold px-4 gap-1.5"
              onClick={handleFinishAndSchedule}
              disabled={saving || isRendering}
            >
              {isRendering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isRendering ? "Rendering..." : "Finish & Schedule"}
            </Button>
          </div>
        </div>

        {/* ── WORKSPACE ───────────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ── LEFT: Tool Rail ──────────────────────────────────────────────── */}
          <div className="w-[60px] shrink-0 bg-[#18181B] border-r border-white/[0.07] flex flex-col items-center py-3 gap-1">
            {tools.map((tool) => {
              const Icon = tool.icon;
              const active = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => setActiveTool(active ? null : tool.id)}
                  className={cn(
                    "w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all text-[9px] font-bold uppercase tracking-wider",
                    active
                      ? "bg-[#5865F2]/20 text-[#818CF8] border border-[#5865F2]/40"
                      : "text-white/30 hover:text-white/70 hover:bg-white/5 border border-transparent"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tool.label}
                </button>
              );
            })}
          </div>

          {/* ── LEFT PANEL: Tool Content (collapsible) ────────────────────────── */}
          <div className={cn(
            "shrink-0 border-r border-white/[0.07] bg-[#18181B] overflow-y-auto transition-all duration-200",
            activeTool ? "w-64" : "w-0 overflow-hidden"
          )}>
            {activeTool && (
              <div className="p-4 space-y-4 min-w-[256px]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/50">
                    {tools.find(t => t.id === activeTool)?.label}
                  </span>
                  <button onClick={() => setActiveTool(null)} className="text-white/30 hover:text-white/70 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* TEXT / CAPTIONS */}
                {activeTool === "captions" && (
                  <div className="space-y-4">
                    <CaptionEditor
                      initialCaption={incomingClip?.caption}
                      onChange={setCaptionLines}
                    />
                    <Separator className="bg-white/[0.07]" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2">Style</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {TEXT_STYLES.map((s) => (
                          <button
                            key={s.value}
                            onClick={() => setTextStyle(s.value)}
                            className={cn(
                              "h-8 rounded-lg text-xs font-semibold transition-all border",
                              textStyle === s.value
                                ? "bg-[#5865F2]/30 border-[#5865F2]/60 text-[#818CF8]"
                                : "bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white/70"
                            )}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* AUDIO */}
                {activeTool === "audio" && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-white/30">Add background music or voiceover to your clip.</p>
                    <AudioTimeline onAudioChange={(f) => setHasAudio(!!f)} />
                    <Separator className="bg-white/[0.07]" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2">Volume</p>
                      <div className="flex items-center gap-2">
                        <Volume2 className="h-3.5 w-3.5 text-white/40 shrink-0" />
                        <input
                          type="range" min={0} max={1} step={0.01}
                          value={muted ? 0 : volume}
                          onChange={(e) => { setVolume(+e.target.value); setMuted(false); }}
                          className="flex-1 accent-[#5865F2]"
                        />
                        <span className="text-[10px] font-mono text-white/40 w-8 text-right">{Math.round((muted ? 0 : volume) * 100)}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI ENHANCE */}
                {activeTool === "enhance" && (
                  <div className="space-y-4">
                    <Button
                      className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold gap-2"
                      onClick={handleGenerateHooks}
                      disabled={isGenerating || !videoUrl}
                    >
                      {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {isGenerating ? "Analyzing clip…" : "Generate AI Hooks"}
                    </Button>
                    {clip && (
                      <>
                        <Separator className="bg-white/[0.07]" />
                        <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">Viral Score</p>
                          <div className="flex items-end gap-2">
                            <span className="text-4xl font-black text-white">{clip.viralScore ?? "—"}</span>
                            <span className="text-xs text-white/30 pb-1">/ 100</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#5865F2] to-[#00D4AA]"
                              style={{ width: `${clip.viralScore ?? 0}%` }}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">Platform Targets</p>
                          {["TikTok 9:16", "Instagram Reels", "YouTube Shorts"].map((p) => (
                            <div key={p} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                              <span className="text-xs text-white/60">{p}</span>
                              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[9px]">Ready</Badge>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* COMBINE */}
                {activeTool === "combine" && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-white/30">Add clips from your library to build a multi-clip sequence.</p>
                    <ClipCombiner currentClipId={clip?.id} onChange={setCombinedClipIds} />
                  </div>
                )}

                {/* UPLOAD */}
                {activeTool === "upload" && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-white/30">Upload images (≤ 5 MB) or videos (≤ 75 MB) to include in this clip.</p>

                    <MediaUploader onChange={setMediaUrls} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── CENTER: Preview ──────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col items-center justify-center bg-[#0E0E11] relative overflow-hidden">
            {/* Portrait video wrapper — 9:16 aspect ratio */}
            <div className="relative flex-1 w-full flex items-center justify-center py-6">
              <div
                className="relative bg-black rounded-xl overflow-hidden shadow-2xl"
                style={{
                  aspectRatio: "9/16",
                  maxHeight: "calc(100% - 48px)",
                  width: "auto",
                }}
              >
                {videoUrl ? (
                  <>
                    <ReactPlayer
                      ref={playerRef}
                      url={videoUrl}
                      playing={playing}
                      volume={muted ? 0 : volume}
                      onDuration={handleDuration}
                      onProgress={handleProgress}
                      width="100%"
                      height="100%"
                      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                      config={{ 
                        file: { attributes: { crossOrigin: "anonymous" } },
                        youtube: { playerVars: { modestbranding: 1 } } 
                      }}
                    />

                    {/* Caption overlay */}
                    <div className="pointer-events-none absolute inset-0 z-10">
                      <CaptionOverlay lines={captionLines} textStyle={textStyle} />
                    </div>
                    {/* Center play/pause tap target */}
                    <button
                      className="absolute inset-0 flex items-center justify-center z-20 group"
                      onClick={() => setPlaying((p) => !p)}
                    >
                      <div className={cn(
                        "w-14 h-14 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center shadow-2xl transition-all duration-200",
                        playing ? "opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100" : "opacity-100 scale-100"
                      )}>
                        {playing
                          ? <Pause className="h-6 w-6 text-white" />
                          : <Play className="h-6 w-6 text-white ml-1" />}
                      </div>
                    </button>
                    {/* Safe-zone overlay indicator (9:16 frame) */}
                    <div className="absolute inset-3 border border-white/10 rounded-lg pointer-events-none z-30" />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/20">
                    <Film className="h-10 w-10" />
                  </div>
                )}
              </div>
            </div>

            {/* ── Playback controls ───────────────────────────────────────────── */}
            <div className="w-full shrink-0 px-4 py-2 border-t border-white/[0.07] bg-[#18181B] flex items-center gap-3">
              {/* Time */}
              <span className="text-[11px] font-mono text-white/40 shrink-0 w-24">
                {fmt(currentTime)} / {fmt(duration)}
              </span>

              <div className="flex items-center gap-1 mx-auto">
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10 rounded-lg"
                  onClick={() => handleSeek(startSec)}>
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10 rounded-lg"
                  onClick={() => seekRelative(-5)}>
                  <span className="text-[10px] font-bold">-5s</span>
                </Button>
                <button
                  className="w-10 h-10 rounded-full bg-[#5865F2] hover:bg-[#4752C4] flex items-center justify-center transition-all shadow-lg shadow-[#5865F2]/30"
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playing ? <Pause className="h-5 w-5 text-white" /> : <Play className="h-5 w-5 text-white ml-0.5" />}
                </button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10 rounded-lg"
                  onClick={() => seekRelative(5)}>
                  <span className="text-[10px] font-bold">+5s</span>
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10 rounded-lg"
                  onClick={() => handleSeek(endSec)}>
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>

              {/* Clip duration + mute */}
              <div className="flex items-center gap-2 ml-auto shrink-0">
                <span className="text-[11px] font-mono text-white/40">
                  {fmt(clipDuration)} clip
                </span>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-white/40 hover:text-white hover:bg-white/10 rounded-lg"
                  onClick={() => setMuted((m) => !m)}>
                  <Volume2 className={cn("h-3.5 w-3.5", muted && "opacity-30")} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── BOTTOM: Multi-track Timeline ─────────────────────────────────────── */}
        <div className="shrink-0 border-t border-white/[0.07] bg-[#18181B]" style={{ height: hasAudio || captionLines.filter(Boolean).length > 0 ? 140 : 110 }}>
          {/* Timeline toolbar */}
          <div className="flex items-center gap-2 px-4 h-8 border-b border-white/[0.07]">
            <Scissors className="h-3 w-3 text-white/30" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">Timeline</span>
            <div className="ml-auto flex items-center gap-1">
              <span className="text-[10px] font-mono text-white/20">{fmt(startSec)} — {fmt(endSec)}</span>
            </div>
          </div>

          {duration > 0 ? (
            <TrackTimeline
              duration={duration}
              startSec={startSec}
              endSec={endSec}
              currentTime={currentTime}
              onStartChange={(s) => { setStartSec(s); handleSeek(s); }}
              onEndChange={(s) => { setEndSec(s); handleSeek(s); }}
              onSeek={handleSeek}
              hasAudio={hasAudio}
              hasCaptions={captionLines.filter(Boolean).length > 0}
            />
          ) : (
            <div className="flex items-center justify-center h-16 text-white/20 text-xs gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading timeline…
            </div>
          )}
        </div>

        {/* ── Upgrade modal ───────────────────────────────────────────────────── */}
        {showUpgradeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#18181B] p-6 shadow-2xl space-y-4">
              <h2 className="text-lg font-bold text-white">Edit limit reached</h2>
              <p className="text-sm text-white/50">
                You've used all <strong className="text-white">{editLimitFor(userPlan)}</strong> edits on your{" "}
                <strong className="text-white capitalize">{userPlan}</strong> plan.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-white/10 text-white/50 hover:bg-white/5"
                  onClick={() => setShowUpgradeModal(false)}>Cancel</Button>
                <Button className="flex-1 bg-[#5865F2] hover:bg-[#4752C4] text-white"
                  onClick={() => { setShowUpgradeModal(false); navigate("/billing"); }}>
                  Upgrade Plan
                </Button>
              </div>
            </div>
          </div>
        )}

        <ScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          videoUrl={renderedVideoUrl}
          onSchedule={handleSchedulePost}
        />
      </div>
    </AppLayout>
  );
}
