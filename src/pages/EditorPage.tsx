import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactPlayer from "react-player";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Play, Pause, Save, ArrowLeft, Loader2,
  Zap, Type, Film, Upload,
} from "lucide-react";
import { api, type Clip } from "@/lib/api-client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Timeline } from "@/components/editor/Timeline";
import { AudioTimeline } from "@/components/editor/AudioTimeline";
import { CaptionEditor, CaptionOverlay } from "@/components/editor/CaptionEditor";
import { ClipCombiner } from "@/components/editor/ClipCombiner";
import { MediaUploader } from "@/components/editor/MediaUploader";

// ─── Edit limits (spec: Free=3, Pro=10, Agency=20) ────────────────────────────
const EDIT_LIMITS: Record<string, number> = { free: 3, pro: 10, agency: 20, unlimited: 999 };

function editLimitFor(plan: string) { return EDIT_LIMITS[plan.toLowerCase()] ?? 3; }

// ─── Types ────────────────────────────────────────────────────────────────────
interface LocationState {
  clip?: Clip;
  video?: {
    id: string; title: string; url: string;
    thumbnail?: string; duration?: string; viralScore?: number;
  };
}

const TEXT_STYLES = [
  { value: "bold", label: "Bold" },
  { value: "gradient", label: "Gradient" },
  { value: "outline", label: "Outline" },
] as const;

// ─── Page ────────────────────────────────────────────────────────────────────
export default function EditorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, effectivePlan } = useAuth();
  const userPlan = effectivePlan;

  const state = location.state as LocationState | null;
  const incomingClip = state?.clip ?? null;
  const incomingVideo = state?.video ?? null;

  // ── Player state
  const playerRef = useRef<ReactPlayer>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // ── Clip data
  const [clip, setClip] = useState<Clip | null>(incomingClip);
  const [videoUrl, setVideoUrl] = useState(
    incomingClip?.videoUrl ?? incomingVideo?.url ?? "",
  );
  const [title, setTitle] = useState(
    incomingClip?.title ?? incomingVideo?.title ?? "",
  );

  // ── Editor state
  const [startSec, setStartSec] = useState(incomingClip?.startSec ?? 0);
  const [endSec, setEndSec] = useState(
    incomingClip?.endSec ?? (incomingClip?.durationSeconds ?? 0),
  );
  const [captionLines, setCaptionLines] = useState<string[]>(
    incomingClip?.captionLines ?? (incomingClip?.caption ? [incomingClip.caption] : [""]),
  );
  const [combinedClipIds, setCombinedClipIds] = useState<string[]>(
    incomingClip?.combinedClipIds ?? [],
  );
  const [textStyle, setTextStyle] = useState(incomingClip?.textStyle ?? "bold");
  const [mediaUrls, setMediaUrls] = useState<string[]>(incomingClip?.mediaUrls ?? []);

  // ── UI state
  const [saving, setSaving] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // ── Sync duration to endSec once video loads
  const handleDuration = (d: number) => {
    setDuration(d);
    if (!incomingClip?.endSec) setEndSec(Math.floor(d));
  };

  const handleProgress = ({ playedSeconds }: { playedSeconds: number }) => {
    setCurrentTime(playedSeconds);
  };

  const togglePlay = () => setPlaying((p) => !p);

  // ── Save
  const handleSave = useCallback(async () => {
    if (!clip) {
      toast.error("No clip loaded — open a clip from My Videos first.");
      return;
    }
    const limit = editLimitFor(userPlan);
    if ((clip.editCount ?? 0) >= limit) {
      setShowUpgradeModal(true);
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateClip(clip.id, {
        title,
        startSec,
        endSec,
        captionLines,
        combinedClipIds,
        textStyle,
        mediaUrls,
      });
      if (res.success && res.data) {
        setClip(res.data);
        toast.success("Clip saved.");
      } else {
        toast.error(res.error ?? "Save failed.");
      }
    } catch {
      toast.error("Save failed. Check your connection.");
    } finally {
      setSaving(false);
    }
  }, [clip, userPlan, title, startSec, endSec, captionLines, combinedClipIds, textStyle, mediaUrls]);

  // ── Empty state — no clip or video
  if (!clip && !incomingVideo && !videoUrl) {
    return (
      <AppLayout container>
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <Film className="h-12 w-12 text-muted-foreground/20" />
          <h2 className="text-xl font-semibold">No clip loaded</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Open a clip from My Videos or use Viral Search to send a video here.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/studio/videos")}>
              My Videos
            </Button>
            <Button className="btn-gradient" onClick={() => navigate("/discovery")}>
              Viral Search
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout className="overflow-hidden">
      <div className="flex flex-col h-screen overflow-hidden">
        {/* ── Top bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-card/40 backdrop-blur shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground min-w-0"
            placeholder="Clip title…"
          />
          <div className="flex items-center gap-2 shrink-0">
            {clip && (
              <Badge variant="outline" className="text-xs hidden sm:flex">
                {clip.editCount ?? 0}/{editLimitFor(userPlan)} edits
              </Badge>
            )}
            <Button
              size="sm"
              className="btn-gradient gap-1.5 h-8"
              onClick={handleSave}
              disabled={saving || !clip}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        </div>

        {/* ── Main area */}
        <div className="flex flex-1 overflow-hidden">
          {/* ─── Left: Preview + Timeline ─────────────────────────────────── */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {/* Video preview */}
            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
              {videoUrl ? (
                <>
                  <ReactPlayer
                    ref={playerRef}
                    url={videoUrl}
                    playing={playing}
                    onDuration={handleDuration}
                    onProgress={handleProgress}
                    width="100%"
                    height="100%"
                    style={{ position: "absolute", inset: 0 }}
                    config={{ youtube: { playerVars: { modestbranding: 1 } } }}
                  />
                  {/* Caption overlay */}
                  <CaptionOverlay lines={captionLines} />
                  {/* Play/Pause overlay button */}
                  <button
                    className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity z-10"
                    onClick={togglePlay}
                  >
                    <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                      {playing
                        ? <Pause className="h-6 w-6 text-white" />
                        : <Play className="h-6 w-6 text-white ml-1" />}
                    </div>
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground/30">
                  <Film className="h-12 w-12" />
                  <p className="text-sm">No video URL</p>
                </div>
              )}
            </div>

            {/* ── Timelines panel */}
            <div className="bg-card/60 border-t border-border/50 p-3 space-y-3 shrink-0">
              <Timeline
                duration={duration}
                startSec={startSec}
                endSec={endSec}
                currentTime={currentTime}
                onStartChange={setStartSec}
                onEndChange={setEndSec}
              />
              <AudioTimeline />
              {/* Sequence strip */}
              {combinedClipIds.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 shrink-0 mr-1">
                    Clips
                  </span>
                  {combinedClipIds.map((id, i) => (
                    <div
                      key={id}
                      className="shrink-0 h-8 px-2 rounded bg-muted/60 border border-border/50 flex items-center text-[11px] text-muted-foreground gap-1"
                    >
                      <Film className="h-3 w-3" />
                      Clip {i + 1}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─── Right sidebar: Tools ──────────────────────────────────────── */}
          <div className="w-72 shrink-0 border-l border-border/50 bg-card/30 flex flex-col overflow-hidden hidden lg:flex">
            <Tabs defaultValue="captions" className="flex flex-col h-full">
              <TabsList className="rounded-none border-b border-border/50 bg-transparent p-0 h-auto shrink-0">
                {[
                  { value: "captions", icon: Type, label: "Captions" },
                  { value: "enhance", icon: Zap, label: "Enhance" },
                  { value: "combine", icon: Film, label: "Combine" },
                  { value: "upload", icon: Upload, label: "Upload" },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 gap-1 text-[11px] font-medium"
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex-1 overflow-y-auto">
                {/* Captions */}
                <TabsContent value="captions" className="p-3 m-0">
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Edit caption lines. Hover a line to reveal the emoji picker. Preview renders on the video above.
                  </p>
                  <CaptionEditor
                    initialCaption={incomingClip?.caption}
                    onChange={setCaptionLines}
                  />
                  <Separator className="my-3" />
                  <p className="text-[11px] font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                    Text Style
                  </p>
                  <div className="flex gap-1.5">
                    {TEXT_STYLES.map((s) => (
                      <Button
                        key={s.value}
                        size="sm"
                        variant={textStyle === s.value ? "default" : "outline"}
                        className="h-7 text-xs flex-1"
                        onClick={() => setTextStyle(s.value)}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </TabsContent>

                {/* Enhance */}
                <TabsContent value="enhance" className="p-3 m-0 space-y-3">
                  {clip && (
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1.5">
                      <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                        Viral Score
                      </p>
                      <div className="flex items-end gap-2">
                        <span className="text-3xl font-bold">
                          {clip.viralScore ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground pb-1">/ 100</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full"
                          style={{ width: `${clip.viralScore ?? 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Platform Targets
                    </p>
                    {["TikTok 9:16", "Instagram Reels", "YouTube Shorts"].map((p) => (
                      <div
                        key={p}
                        className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
                      >
                        <span className="text-xs">{p}</span>
                        <Badge variant="secondary" className="text-[10px]">Ready</Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* Combine */}
                <TabsContent value="combine" className="p-3 m-0">
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Add clips from your library to create a multi-clip sequence. Drag to reorder.
                  </p>
                  <ClipCombiner
                    currentClipId={clip?.id}
                    onChange={setCombinedClipIds}
                  />
                </TabsContent>

                {/* Upload */}
                <TabsContent value="upload" className="p-3 m-0">
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Upload your own images or videos to include in this clip. Video ≤ 100MB · Image ≤ 5MB.
                  </p>
                  <MediaUploader onChange={setMediaUrls} />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </div>

      {/* ── Upgrade modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold">Edit limit reached</h2>
            <p className="text-sm text-muted-foreground">
              You've used all <strong>{editLimitFor(userPlan)}</strong> edits on your{" "}
              <strong className="capitalize">{userPlan}</strong> plan.
              Upgrade to unlock more.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowUpgradeModal(false)}>
                Cancel
              </Button>
              <Button
                className="btn-gradient flex-1"
                onClick={() => { setShowUpgradeModal(false); navigate("/billing"); }}
              >
                Upgrade
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
