import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useExportStore } from "@/stores/export-store";
import {
  bundleJobsAsZip,
  requestWakeLock,
  releaseWakeLock,
  getRecommendedConcurrency,
  estimateMemoryForJobs,
} from "@/lib/batch-export";
import {
  X, Loader2, Download, Package, AlertCircle, CheckCircle2,
  Trash2, Play, Pause, FileArchive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/api-client";
import { loadFFmpeg, renderClip, shouldUseServerFallback } from "@/lib/ffmpeg-wasm";

interface BatchExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clips: Array<{
    id: string;
    title: string;
    videoUrl?: string;
    startSec?: number | null;
    endSec?: number | null;
    captionLines?: string[] | null;
    aspectRatio?: string | null;
  }>;
}

function jobIdFor(clipId: string) {
  return `batch_${clipId}_${Date.now()}`;
}

export function BatchExportModal({ isOpen, onClose, clips }: BatchExportModalProps) {
  const store = useExportStore();
  const { queue, isBatchRunning } = store;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [overallProgress, setOverallProgress] = useState(0);

  useEffect(() => {
    if (isOpen && clips.length > 0) {
      // Pre-select all clips with video URLs
      const selectable = clips.filter((c) => c.videoUrl).map((c) => c.id);
      setSelectedIds(new Set(selectable));
    }
  }, [isOpen, clips]);

  useEffect(() => {
    if (!isBatchRunning) return;
    const completed = queue.filter((j) => j.status === "completed").length;
    const total = queue.length;
    setOverallProgress(total > 0 ? Math.round((completed / total) * 100) : 0);
  }, [queue, isBatchRunning]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startBatch = useCallback(async () => {
    const selectedClips = clips.filter((c) => selectedIds.has(c.id) && c.videoUrl);
    if (selectedClips.length === 0) {
      toast.error("Select at least one clip with a video URL");
      return;
    }

    if (!estimateMemoryForJobs(selectedClips.length, 40)) {
      toast.error("Not enough memory for batch export. Try fewer clips.");
      return;
    }

    const concurrency = getRecommendedConcurrency();
    if (concurrency === 1) {
      toast.info("Running in single-file mode to save memory");
    }

    // Build queue
    const jobs: import("@/stores/export-store").ExportJob[] = selectedClips.map((c) => ({
      id: jobIdFor(c.id),
      clipId: c.id,
      name: c.title,
      status: "pending",
      progress: 0,
    }));
    store.setQueue(jobs);
    store.setBatchRunning(true);

    // Wake lock
    const lock = await requestWakeLock();
    if (lock) store.setWakeLock(lock);

    try {
      // Load FFmpeg once
      const ffmpeg = await loadFFmpeg();

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const clip = selectedClips[i];
        store.updateStatus(job.id, "processing");
        store.updateProgress(job.id, 5);

        try {
          // Fetch source video
          const res = await fetch(clip.videoUrl!);
          if (!res.ok) throw new Error("Failed to fetch source video");
          const videoBlob = await res.blob();
          store.updateProgress(job.id, 20);

          const start = clip.startSec ?? 0;
          const end = clip.endSec ?? 30;

          const renderedBlob = await renderClip(ffmpeg, videoBlob, start, end, {
            aspectRatio: clip.aspectRatio || "9/16",
            maxHeight: 720,
            crf: 28,
            preset: "ultrafast",
            onProgress: (p) => {
              // p is 0-1 for ffmpeg progress; map 20%->95%
              const mapped = 20 + p * 75;
              store.updateProgress(job.id, mapped);
            },
          });

          store.updateProgress(job.id, 95);

          // Upload rendered video
          const uploadRes = await api.uploadRender(clip.id, new File([renderedBlob], `${clip.title}.mp4`, { type: "video/mp4" }));
          if (!uploadRes.success || !uploadRes.data?.url) {
            throw new Error(uploadRes.error || "Upload failed");
          }

          // Create local blob URL for download
          const blobUrl = URL.createObjectURL(renderedBlob);
          store.setBlobUrl(job.id, blobUrl);
          store.updateStatus(job.id, "completed");
          store.updateProgress(job.id, 100);
        } catch (err: any) {
          console.error(`[batch] Job ${job.id} failed:`, err);
          store.updateStatus(job.id, "failed", err?.message || "Render failed");
        }
      }

      const allCompleted = store.queue.every((j) => j.status === "completed");
      if (allCompleted) {
        toast.success("All clips exported successfully!");
      } else {
        const failedCount = store.queue.filter((j) => j.status === "failed").length;
        toast.error(`${failedCount} clip(s) failed to export`);
      }
    } catch (err: any) {
      toast.error("Batch export error: " + (err.message || "Unknown"));
    } finally {
      store.setBatchRunning(false);
      const currentLock = useExportStore.getState().wakeLock;
      await releaseWakeLock(currentLock);
      store.setWakeLock(null);
    }
  }, [clips, selectedIds, store]);

  const handleDownloadZip = async () => {
    const completed = queue.filter((j) => j.status === "completed" && j.blobUrl);
    if (completed.length === 0) {
      toast.error("No completed exports to download");
      return;
    }
    toast.info("Building ZIP archive…");
    try {
      await bundleJobsAsZip(completed);
      toast.success("ZIP downloaded!");
    } catch (e) {
      toast.error("Failed to create ZIP");
    }
  };

  const handleDownloadIndividual = (job: import("@/stores/export-store").ExportJob) => {
    if (!job.blobUrl) return;
    const a = document.createElement("a");
    a.href = job.blobUrl;
    a.download = `${job.name.replace(/[^a-z0-9_\-]/gi, "_")}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-lg bg-[#18181B] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="shrink-0 px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-[#5865F2]" />
                <h2 className="text-lg font-bold text-white">Batch Export</h2>
              </div>
              <button
                onClick={onClose}
                disabled={isBatchRunning}
                className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                <X className="h-4 w-4 text-white/60" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Info */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-1">
                <p className="text-xs text-white/50">
                  Select clips to export. Browser rendering is used for uploaded videos.
                </p>
                {shouldUseServerFallback() && (
                  <p className="text-[10px] text-amber-400/70 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Low memory device — only 1 clip at a time recommended.
                  </p>
                )}
              </div>

              {/* Overall progress */}
              {isBatchRunning && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/50">Overall progress</span>
                    <span className="text-white/70 font-mono">{overallProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-[#5865F2] transition-all duration-300"
                      style={{ width: `${overallProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Clip list */}
              <div className="space-y-2">
                {clips.map((clip) => {
                  const isSelected = selectedIds.has(clip.id);
                  const job = queue.find((j) => j.clipId === clip.id);
                  const hasVideo = !!clip.videoUrl;

                  return (
                    <div
                      key={clip.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
                        isSelected
                          ? "bg-[#5865F2]/10 border-[#5865F2]/30"
                          : "bg-white/[0.02] border-white/10 hover:border-white/20",
                        !hasVideo && "opacity-40"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => hasVideo && toggleSelection(clip.id)}
                        disabled={!hasVideo || isBatchRunning}
                        className="accent-[#5865F2] h-4 w-4 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/80 truncate">{clip.title}</p>
                        {!hasVideo && (
                          <p className="text-[10px] text-white/30">Not rendered yet</p>
                        )}
                      </div>
                      {job && (
                        <div className="shrink-0 flex items-center gap-2">
                          {job.status === "processing" && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#5865F2]" />
                          )}
                          {job.status === "completed" && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                          )}
                          {job.status === "failed" && (
                            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                          )}
                          <span className="text-[10px] font-mono text-white/40 w-8 text-right">
                            {Math.round(job.progress)}%
                          </span>
                          {job.status === "completed" && job.blobUrl && (
                            <button
                              onClick={() => handleDownloadIndividual(job)}
                              className="text-white/30 hover:text-white/70 transition-colors"
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-5 py-4 border-t border-white/[0.07] flex items-center gap-2">
              {!isBatchRunning ? (
                <>
                  <Button
                    className="flex-1 bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold gap-2"
                    onClick={startBatch}
                    disabled={selectedIds.size === 0}
                  >
                    <Play className="h-4 w-4" />
                    Export {selectedIds.size} Clip{selectedIds.size !== 1 ? "s" : ""}
                  </Button>
                  {queue.some((j) => j.status === "completed" && j.blobUrl) && (
                    <Button
                      variant="outline"
                      className="border-white/10 text-white/70 hover:bg-white/5 gap-1.5"
                      onClick={handleDownloadZip}
                    >
                      <FileArchive className="h-4 w-4" />
                      ZIP
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="border-white/10 text-white/50 hover:text-red-400 hover:border-red-400/30"
                    onClick={() => store.resetQueue()}
                    disabled={queue.length === 0}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <div className="flex-1 flex items-center gap-2 text-xs text-white/50">
                  <Loader2 className="h-4 w-4 animate-spin text-[#5865F2]" />
                  Processing… keep this tab open
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
