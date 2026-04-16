import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactPlayer from "react-player";
import { useNavigate, useLocation } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Scissors, Pencil, Play, Pause, Loader2, Video, AlertCircle, Save, CheckCircle, Crown } from "lucide-react";
import { api, type Clip, type ViralVideo } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import { toast } from "sonner";

// ─── Edit limits (spec: Free=1, Pro=3, Agency=10) ────────────────────────────
const EDIT_LIMITS: Record<string, number> = { free: 1, pro: 3, agency: 10, unlimited: 999 };
function editLimitFor(plan: string) { return EDIT_LIMITS[plan.toLowerCase()] ?? 1; }

// ─── Quirky save loader ───────────────────────────────────────────────────────
const QUIRKY = [
  "✂️ Snipping the timeline…",
  "🤖 Teaching the AI to remember…",
  "🔥 Committing your genius edits…",
  "⚡ Turbo-saving to the cloud…",
  "🎯 Targeting the archives…",
  "💾 Locking it in forever…",
  "Check us out at codedmotion.studio ✨",
];

function QuirkySaveLoader() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % QUIRKY.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2.5 h-2.5 rounded-full bg-primary"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 0.6, delay: i * 0.12, repeat: Infinity }}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="text-xs text-muted-foreground text-center max-w-xs"
        >
          {QUIRKY[idx]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

// ─── Mode detection ──────────────────────────────────────────────────────────
type EditorMode = "clip-edit" | "video-preview";

interface LocationState {
  clip?: Clip;
  video?: ViralVideo;
}

export default function EditorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const userPlan = user?.plan ?? "free";

  const state = location.state as LocationState | null;
  const incomingClip = state?.clip ?? null;
  const incomingVideo = state?.video ?? null;

  // ── Mode ────────────────────────────────────────────────────────────────────
  const mode: EditorMode = incomingClip ? "clip-edit" : "video-preview";

  // ── Player ──────────────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const videoUrl = incomingClip?.videoUrl ?? incomingVideo?.url ?? "";

  // ── Clip edit fields ─────────────────────────────────────────────────────────
  const [clip, setClip] = useState<Clip | null>(incomingClip);
  const [title, setTitle] = useState(incomingClip?.title ?? "");
  const [caption, setCaption] = useState(incomingClip?.caption ?? "");
  const [platform, setPlatform] = useState(incomingClip?.platform ?? "TikTok");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // ── Edit limit ───────────────────────────────────────────────────────────────
  const editLimit = editLimitFor(userPlan);
  const editsUsed = clip?.editCount ?? 0;
  const editsLeft = Math.max(0, editLimit - editsUsed);
  const isAtLimit = editsLeft <= 0;

  // Sync state when navigating back to the page with a different clip
  useEffect(() => {
    if (incomingClip) {
      setClip(incomingClip);
      setTitle(incomingClip.title);
      setCaption(incomingClip.caption ?? "");
      setPlatform(incomingClip.platform);
      setSaved(false);
    }
  }, [incomingClip?.id]);

  // ── Save handler ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!clip) return;
    if (isAtLimit) {
      if (userPlan === "agency") {
        // Agency soft cap: show the contact modal
        toast.error("You've hit the 10 saved-edit cap. Contact us to unlock more edits for this clip.");
        return;
      }
      setUpgradeOpen(true);
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.updateClip(clip.id, { title, caption, platform });
      if (res.success && res.data) {
        setClip(res.data);
        setSaved(true);
        toast.success("Clip saved!");
        // Reset saved checkmark after 2.5s
        setTimeout(() => setSaved(false), 2500);
      } else {
        toast.error(res.error ?? "Save failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }, [clip, title, caption, platform, isAtLimit, userPlan]);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!incomingClip && !incomingVideo) {
    return (
      <AppLayout container contentClassName="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-center text-muted-foreground max-w-sm">
          <Video className="h-12 w-12 opacity-30" />
          <h2 className="text-xl font-semibold text-foreground">No clip loaded</h2>
          <p className="text-sm">
            Open a clip from the{" "}
            <button className="underline text-primary" onClick={() => navigate("/studio/clips")}>
              Clip library
            </button>{" "}
            or discover a video to get started.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout container contentClassName="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Scissors className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-display font-bold">
          {mode === "clip-edit" ? "Edit Clip" : "Preview Studio"}
        </h1>
        {clip && (
          <Badge variant="secondary" className="text-xs">
            {editsLeft} save{editsLeft !== 1 ? "s" : ""} left
          </Badge>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Left: Video player ─────────────────────────────────────────── */}
        <div className="flex-1 space-y-3">
          <Card className="overflow-hidden border-border/80">
            <div className="aspect-video bg-black">
              {videoUrl ? (
                <ReactPlayer
                  url={videoUrl}
                  playing={playing}
                  controls
                  width="100%"
                  height="100%"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-6 text-center gap-2">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  No video URL available for this clip.
                </div>
              )}
            </div>
            {videoUrl && (
              <CardContent className="p-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {playing ? "Pause" : "Play"}
                </Button>
              </CardContent>
            )}
          </Card>

          {/* Clip info (thumbnail + meta) when editing a clip */}
          {clip && (
            <Card className="border-border/60 bg-card/50">
              <CardContent className="pt-4 flex items-center gap-4">
                {clip.thumbnail ? (
                  <img
                    src={clip.thumbnail}
                    alt={clip.title}
                    className="h-14 w-24 object-cover rounded-md shrink-0"
                  />
                ) : (
                  <div className="h-14 w-24 bg-muted rounded-md flex items-center justify-center text-muted-foreground/30 shrink-0">
                    <Video className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Clip ID</p>
                  <p className="text-xs font-mono truncate text-foreground/70">{clip.id}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">{clip.status}</Badge>
                    {clip.duration && (
                      <span className="text-xs text-muted-foreground">{clip.duration}</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right: Edit panel ──────────────────────────────────────────── */}
        {mode === "clip-edit" && clip && (
          <div className="w-full lg:w-96 space-y-4">
            <Card className="border-border/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Pencil className="h-4 w-4 text-primary" />
                  Edit details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {saving ? (
                  <QuirkySaveLoader />
                ) : (
                  <>
                    {/* Edit limit warning */}
                    {isAtLimit ? (
                      <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium mb-0.5">
                            Save limit reached ({editLimit} for {userPlan} plan)
                          </p>
                          {userPlan === "agency" ? (
                            <p>Contact us at <a href="mailto:support@codedmotion.studio" className="underline">support@codedmotion.studio</a> to unlock additional edits.</p>
                          ) : (
                            <p>
                              <button className="underline font-medium" onClick={() => setUpgradeOpen(true)}>
                                Upgrade your plan
                              </button>{" "}
                              to unlock more saved edits.
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {editsLeft} save{editsLeft !== 1 ? "s" : ""} remaining on your {userPlan} plan. Each save counts as one edit.
                      </p>
                    )}

                    {/* Title */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Title</label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={isAtLimit}
                        placeholder="Clip title…"
                      />
                    </div>

                    {/* Platform */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Platform</label>
                      <select
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                        disabled={isAtLimit}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        {["TikTok", "Instagram Reels", "YouTube Shorts", "Twitter/X", "LinkedIn"].map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    {/* Caption */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Caption</label>
                      <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        disabled={isAtLimit}
                        rows={5}
                        placeholder="Your viral caption goes here…"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      />
                    </div>

                    {/* Save button */}
                    <motion.div whileHover={!isAtLimit ? { scale: 1.01 } : {}}>
                      <Button
                        className="w-full gap-2"
                        disabled={isAtLimit || saving}
                        onClick={() => void handleSave()}
                        variant={isAtLimit ? "outline" : "default"}
                      >
                        {saved ? (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Saved!
                          </>
                        ) : isAtLimit ? (
                          <>
                            <Crown className="h-4 w-4" />
                            {userPlan === "agency" ? "Contact us to save more" : "Upgrade to save more"}
                          </>
                        ) : (
                          <>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save edit
                          </>
                        )}
                      </Button>
                    </motion.div>
                  </>
                )}
              </CardContent>
            </Card>

            <Button
              variant="ghost"
              className="w-full text-sm text-muted-foreground"
              onClick={() => navigate("/studio/clips")}
            >
              ← Back to clip library
            </Button>
          </div>
        )}
      </div>

      {/* Upgrade modal */}
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="More saved edits"
        reason={`Your ${userPlan} plan allows ${editLimit} saved edit${editLimit !== 1 ? "s" : ""} per clip. Upgrade to save more versions and unlock longer clip durations.`}
        requiredPlan="pro"
      />
    </AppLayout>
  );
}
