/**
 * Batch export utilities: Wake Lock, JSZip bundling, sequential processing.
 */

import JSZip from "jszip";
import { useExportStore, type ExportJob } from "@/stores/export-store";

// ─── Wake Lock ───────────────────────────────────────────────────────────────
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if (!("wakeLock" in navigator)) return null;
  try {
    const lock = await (navigator as any).wakeLock.request("screen");
    console.log("[wake-lock] Acquired");
    return lock;
  } catch (err) {
    console.warn("[wake-lock] Failed:", err);
    return null;
  }
}

export async function releaseWakeLock(lock: WakeLockSentinel | null) {
  if (!lock) return;
  try {
    await lock.release();
    console.log("[wake-lock] Released");
  } catch (err) {
    console.warn("[wake-lock] Release error:", err);
  }
}

// Re-acquire wake lock on visibility change
export function setupWakeLockReacquire(store: typeof useExportStore) {
  const handler = async () => {
    const state = store.getState();
    if (document.visibilityState === "visible" && state.isBatchRunning && !state.wakeLock) {
      const newLock = await requestWakeLock();
      if (newLock) {
        newLock.addEventListener("release", () => {
          store.setState({ wakeLock: null });
        });
        store.setState({ wakeLock: newLock });
      }
    }
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

// ─── JSZip Bundle ────────────────────────────────────────────────────────────
export async function bundleJobsAsZip(
  jobs: ExportJob[],
  filename = "viraltrim-clips.zip"
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder("clips") || zip;

  for (const job of jobs) {
    if (!job.blobUrl) continue;
    try {
      const res = await fetch(job.blobUrl);
      const blob = await res.blob();
      const safeName = job.name.replace(/[^a-z0-9_\-]/gi, "_").substring(0, 60);
      folder.file(`${safeName}_${job.id.slice(0, 6)}.mp4`, blob);
    } catch (e) {
      console.warn(`[zip] Failed to fetch ${job.id}:`, e);
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Mobile / Memory Checks ──────────────────────────────────────────────────
export function estimateMemoryForJobs(count: number, avgSizeMB = 50): boolean {
  const deviceMemory = (navigator as any).deviceMemory;
  const estimatedMB = count * avgSizeMB;
  if (deviceMemory) {
    // Conservative: need at least 2x estimated for ffmpeg overhead
    return deviceMemory * 1024 > estimatedMB * 2;
  }
  return true; // unknown — allow and let it fail gracefully
}

export function getRecommendedConcurrency(): number {
  const memory = (navigator as any).deviceMemory;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) return 1;
  if (memory && memory >= 8) return 2;
  return 1;
}
