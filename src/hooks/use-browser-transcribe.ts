import { useState, useCallback } from "react";
import { toast } from "@/components/ui/sonner";
import { loadFFmpeg, extractAudio } from "@/lib/ffmpeg-wasm";
import { api } from "@/lib/api-client";

export type TranscribeStage =
  | "idle"
  | "downloading-model"
  | "fetching-video"
  | "extracting-audio"
  | "transcribing"
  | "saving"
  | "done"
  | "error";

interface UseBrowserTranscribeReturn {
  stage: TranscribeStage;
  progress: number;
  stageLabel: string;
  isTranscribing: boolean;
  error: string | null;
  transcribe: (videoUrl: string, videoId: string) => Promise<string | null>;
}

const STAGE_LABELS: Record<TranscribeStage, string> = {
  idle: "",
  "downloading-model": "Downloading AI model (~75MB)…",
  "fetching-video": "Fetching video…",
  "extracting-audio": "Extracting audio…",
  transcribing: "Transcribing with AI…",
  saving: "Saving transcript…",
  done: "Transcript ready!",
  error: "Transcription failed",
};

export function useBrowserTranscribe(): UseBrowserTranscribeReturn {
  const [stage, setStage] = useState<TranscribeStage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const transcribe = useCallback(async (videoUrl: string, videoId: string): Promise<string | null> => {
    setError(null);
    setProgress(0);

    try {
      // 1. Load Whisper model
      setStage("downloading-model");
      const { loadWhisperModel, transcribeAudio } = await import("@/lib/whisper-browser");
      await loadWhisperModel((p) => {
        setProgress(Math.round(p * 25));
      });
      setProgress(25);

      // 2. Fetch video
      setStage("fetching-video");
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error("Failed to fetch video from storage");
      const videoBlob = await res.blob();
      setProgress(35);

      // 3. Extract audio with FFmpeg
      setStage("extracting-audio");
      const ffmpeg = await loadFFmpeg();
      const audioBlob = await extractAudio(ffmpeg, videoBlob);
      setProgress(45);

      // 4. Transcribe
      setStage("transcribing");
      const segments = await transcribeAudio(audioBlob, {
        returnTimestamps: true,
        onProgress: (p) => {
          setProgress(45 + Math.round(p * 40));
        },
      });
      setProgress(85);

      if (segments.length === 0) {
        throw new Error("No speech detected in this video");
      }

      // 5. Combine into plain text transcript
      const transcriptText = segments.map((s) => s.text.trim()).join(" ");
      setProgress(90);

      // 6. Save to server
      setStage("saving");
      const saveRes = await api.updateTranscript(videoId, transcriptText);
      if (!saveRes.success) {
        throw new Error(saveRes.error || "Failed to save transcript");
      }
      setProgress(100);
      setStage("done");
      toast.success("Transcript generated and saved!");
      return transcriptText;
    } catch (err: any) {
      const msg = err?.message || "Browser transcription failed";
      setError(msg);
      setStage("error");
      toast.error(msg);
      return null;
    }
  }, []);

  return {
    stage,
    progress,
    stageLabel: STAGE_LABELS[stage],
    isTranscribing: stage !== "idle" && stage !== "done" && stage !== "error",
    error,
    transcribe,
  };
}
