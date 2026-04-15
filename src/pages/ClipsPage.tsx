import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Search,
  Scissors,
  Pencil,
  X,
  Save,
  Clock,
  AlertCircle,
  CheckCircle,
  Video,
} from "lucide-react";
import { api, type Clip } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

// ─── Edit limits by plan ────────────────────────────────────────────────────
const EDIT_LIMITS: Record<string, number> = { free: 3, pro: 10, agency: 20, unlimited: 999 };

function editLimitFor(plan: string): number {
  return EDIT_LIMITS[plan.toLowerCase()] ?? 3;
}

// ─── Quirky saving messages ──────────────────────────────────────────────────
const SAVING_MESSAGES = [
  "✂️ Snipping the timeline…",
  "🤖 Teaching the AI new tricks…",
  "🎬 Rolling cameras (figuratively)…",
  "🔥 Making it go viral (probably)…",
  "⚡ Turbo-charging your clip…",
  "🎯 Targeting the algorithm…",
  "💾 Committing to the archives…",
  "Check us out at codedmotion.studio ✨",
];

function QuirkySaveLoader() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SAVING_MESSAGES.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-3 h-3 rounded-full bg-primary"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 0.7, delay: i * 0.15, repeat: Infinity }}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="text-sm text-muted-foreground text-center max-w-xs"
        >
          {SAVING_MESSAGES[idx]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

// ─── Inline clip editor ──────────────────────────────────────────────────────
interface ClipEditorProps {
  clip: Clip;
  userPlan: string;
  onSaved: (updated: Clip) => void;
  onClose: () => void;
}

function ClipEditor({ clip, userPlan, onSaved, onClose }: ClipEditorProps) {
  const [title, setTitle] = useState(clip.title);
  const [caption, setCaption] = useState(clip.caption ?? "");
  const [platform, setPlatform] = useState(clip.platform);
  const [saving, setSaving] = useState(false);

  const limit = editLimitFor(userPlan);
  const editsLeft = Math.max(0, limit - (clip.editCount ?? 0));
  const isAtLimit = editsLeft <= 0;

  const handleSave = useCallback(async () => {
    if (isAtLimit) {
      toast.error(`You've used all ${limit} saved edits for this clip. Contact us for additional edits.`);
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateClip(clip.id, { title, caption, platform });
      if (res.success && res.data) {
        toast.success("Clip saved!");
        onSaved(res.data);
      } else {
        toast.error(res.error ?? "Save failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }, [clip.id, title, caption, platform, isAtLimit, limit, onSaved]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <Card className="w-full max-w-lg border-border/60 shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Edit Clip
          </CardTitle>
          <div className="flex items-center gap-2">
            {isAtLimit ? (
              <Badge variant="destructive" className="text-xs">
                Limit reached ({limit} saves)
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                {editsLeft} save{editsLeft !== 1 ? "s" : ""} left
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {saving ? (
            <QuirkySaveLoader />
          ) : (
            <>
              {isAtLimit && (
                <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-md p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    You've used all {limit} saved edits for this clip on the{" "}
                    <strong>{userPlan}</strong> plan. Upgrade or{" "}
                    <a
                      href="mailto:support@codedmotion.studio"
                      className="underline"
                    >
                      contact us
                    </a>{" "}
                    for additional edits.
                  </span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isAtLimit}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Platform</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  disabled={isAtLimit}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {["TikTok", "Instagram", "YouTube Shorts", "Twitter/X", "LinkedIn"].map(
                    (p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Caption</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  disabled={isAtLimit}
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="btn-gradient gap-2"
                  disabled={isAtLimit || saving}
                  onClick={() => void handleSave()}
                >
                  <Save className="h-4 w-4" />
                  Save edit
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Clip card ───────────────────────────────────────────────────────────────
function ClipCard({
  clip,
  userPlan,
  onEdit,
}: {
  clip: Clip;
  userPlan: string;
  onEdit: (clip: Clip) => void;
}) {
  const limit = editLimitFor(userPlan);
  const editsLeft = Math.max(0, limit - (clip.editCount ?? 0));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
    >
      <Card className="group border-border/80 overflow-hidden hover:border-primary/40 transition-colors">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-black/50 overflow-hidden">
          {clip.thumbnail ? (
            <img
              src={clip.thumbnail}
              alt={clip.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground/40">
              <Video className="h-10 w-10" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          {clip.duration && (
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {clip.duration}
            </div>
          )}
          <Badge
            className={cn(
              "absolute top-2 left-2 text-xs",
              clip.status === "posted" && "bg-primary",
            )}
          >
            {clip.status}
          </Badge>
        </div>

        <CardHeader className="pb-2">
          <CardTitle className="text-sm truncate">{clip.title}</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Scissors className="h-3 w-3" />
            <span>{clip.platform}</span>
          </div>
        </CardHeader>

        <CardContent className="pt-0 flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {editsLeft > 0 ? (
              <>
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>{editsLeft} edits left</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3 text-destructive" />
                <span className="text-destructive">Limit reached</span>
              </>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-xs h-7"
            onClick={() => onEdit(clip)}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ClipsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Clip | null>(null);
  // We read the plan from the first clip for now (or default to free)
  const { user } = useAuth();
  const userPlan = user?.plan ?? "free";

  useEffect(() => {
    void (async () => {
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
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return clips;
    return clips.filter(
      (c) =>
        c.title.toLowerCase().includes(q) || c.platform.toLowerCase().includes(q),
    );
  }, [clips, searchTerm]);

  const handleSaved = useCallback((updated: Clip) => {
    setClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditTarget(null);
  }, []);

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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-60" />
          ))}
        </div>
      ) : (
        <motion.div layout className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {filtered.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                userPlan={userPlan}
                onEdit={setEditTarget}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No clips yet. Generate from the studio.
        </p>
      )}

      <AnimatePresence>
        {editTarget && (
          <ClipEditor
            key={editTarget.id}
            clip={editTarget}
            userPlan={userPlan}
            onSaved={handleSaved}
            onClose={() => setEditTarget(null)}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
