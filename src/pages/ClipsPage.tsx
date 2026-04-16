import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
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
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle,
  Video,
  Loader2,
} from "lucide-react";
import { api, type Clip } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

// ─── Edit limits by plan (spec: Free=1, Pro=3, Agency=10) ───────────────────
const EDIT_LIMITS: Record<string, number> = { free: 1, pro: 3, agency: 10, unlimited: 999 };

function editLimitFor(plan: string): number {
  return EDIT_LIMITS[plan.toLowerCase()] ?? 1;
}

// ─── Delete confirmation dialog ──────────────────────────────────────────────
function DeleteDialog({ clip, onConfirm, onCancel }: { clip: Clip; onConfirm: () => void; onCancel: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm bg-card border border-border/60 rounded-xl shadow-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <Trash2 className="h-5 w-5 text-destructive" />
          </div>
          <h2 className="font-semibold text-lg">Delete clip?</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">"{clip.title}"</span> will be permanently deleted and cannot be recovered.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Clip card ───────────────────────────────────────────────────────────────
function ClipCard({
  clip,
  userPlan,
  onEdit,
  onDelete,
  deleting,
}: {
  clip: Clip;
  userPlan: string;
  onEdit: (clip: Clip) => void;
  onDelete: (clip: Clip) => void;
  deleting: boolean;
}) {
  const limit = editLimitFor(userPlan);
  const editsLeft = Math.max(0, limit - (clip.editCount ?? 0));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: deleting ? 0.4 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
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
            <div className="flex items-center justify-center h-full text-muted-foreground/30">
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
              clip.status === "processing" && "bg-yellow-500",
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

        <CardContent className="pt-0 space-y-3">
          {/* Edit count indicator */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {editsLeft > 0 ? (
              <>
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>{editsLeft} saved edit{editsLeft !== 1 ? "s" : ""} left</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3 text-amber-500" />
                <span className="text-amber-500">Save limit reached — contact us to unlock more</span>
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="flex-1 btn-gradient gap-1.5 text-xs h-8"
              onClick={() => onEdit(clip)}
              disabled={deleting}
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:border-destructive/50"
              onClick={() => onDelete(clip)}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ClipsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userPlan = user?.plan ?? "free";

  const [searchTerm, setSearchTerm] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Clip | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  /** Navigate to /studio/editor with clip state so the editor can load it */
  const handleEdit = useCallback((clip: Clip) => {
    navigate("/studio/editor", { state: { clip } });
  }, [navigate]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setDeletingId(id);
    try {
      const res = await api.deleteClip(id);
      if (res.success) {
        setClips((prev) => prev.filter((c) => c.id !== id));
        toast.success("Clip deleted");
      } else {
        toast.error(res.error ?? "Delete failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget]);

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
            placeholder="Filter clips…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Video className="h-10 w-10 opacity-30" />
          <p className="text-sm">No clips yet — generate one from the studio.</p>
        </div>
      ) : (
        <motion.div layout className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {filtered.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                userPlan={userPlan}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
                deleting={deletingId === clip.id}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteDialog
            clip={deleteTarget}
            onConfirm={() => void handleDeleteConfirm()}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
