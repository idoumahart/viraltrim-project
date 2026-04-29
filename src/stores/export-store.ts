import { create } from "zustand";

export interface ExportJob {
  id: string;
  clipId: string;
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  blobUrl?: string;
  error?: string;
}

interface ExportState {
  queue: ExportJob[];
  isBatchRunning: boolean;
  wakeLock: WakeLockSentinel | null;
  // Actions
  setQueue: (jobs: ExportJob[]) => void;
  addJob: (job: ExportJob) => void;
  updateStatus: (id: string, status: ExportJob["status"], error?: string) => void;
  updateProgress: (id: string, progress: number) => void;
  setBlobUrl: (id: string, blobUrl: string) => void;
  removeJob: (id: string) => void;
  resetQueue: () => void;
  setBatchRunning: (running: boolean) => void;
  setWakeLock: (lock: WakeLockSentinel | null) => void;
}

export const useExportStore = create<ExportState>((set) => ({
  queue: [],
  isBatchRunning: false,
  wakeLock: null,

  setQueue: (jobs) => set({
    queue: jobs.map((j) => ({ ...j, status: "pending", progress: 0 })),
  }),

  addJob: (job) => set((s) => ({
    queue: [...s.queue, { ...job, status: "pending", progress: 0 }],
  })),

  updateStatus: (id, status, error) => set((s) => ({
    queue: s.queue.map((j) =>
      j.id === id ? { ...j, status, ...(error ? { error } : {}) } : j
    ),
  })),

  updateProgress: (id, progress) => set((s) => ({
    queue: s.queue.map((j) =>
      j.id === id ? { ...j, progress: Math.min(100, Math.max(0, progress)) } : j
    ),
  })),

  setBlobUrl: (id, blobUrl) => set((s) => ({
    queue: s.queue.map((j) => (j.id === id ? { ...j, blobUrl } : j)),
  })),

  removeJob: (id) => set((s) => ({
    queue: s.queue.filter((j) => j.id !== id),
  })),

  resetQueue: () => set({ queue: [], isBatchRunning: false }),

  setBatchRunning: (running) => set({ isBatchRunning: running }),

  setWakeLock: (wakeLock) => set({ wakeLock }),
}));
