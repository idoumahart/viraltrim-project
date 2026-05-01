import { useState, useCallback, useRef } from "react";
import { toast } from "@/components/ui/sonner";
import { loadFFmpeg, renderAiVideo, shouldUseServerFallback } from "@/lib/ffmpeg-wasm";

export type AiRenderStage =
  | "idle"
  | "loading-ffmpeg"
  | "downloading-clips"
  | "rendering"
  | "uploading"
  | "done"
  | "error";

interface UseAiVideoRenderReturn {
  stage: AiRenderStage;
  progress: number;
  stageLabel: string;
  isRendering: boolean;
  error: string | null;
  outputUrl: string | null;
  render: (params: {
    clips: Array<{ url: string; duration: number }>;
    audioUrl: string;
    script: string;
  }) => Promise<string | null>;
}

const STAGE_LABELS: Record<AiRenderStage, string> = {
  idle: "",
  "loading-ffmpeg": "Loading video engine (~30MB)…",
  "downloading-clips": "Downloading stock footage…",
  rendering: "Compositing your video…",
  uploading: "Uploading to cloud…",
  done: "Video ready!",
  error: "Rendering failed",
};

export function useAiVideoRender(): UseAiVideoRenderReturn {
  const [stage, setStage] = useState<AiRenderStage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const abortRef = useRef(false);

  const render = useCallback(
    async (params: {
      clips: Array<{ url: string; duration: number }>;
      audioUrl: string;
      script: string;
    }): Promise<string | null> => {
      abortRef.current = false;
      setError(null);
      setOutputUrl(null);
      setProgress(0);

      try {
        // 1. Load FFmpeg
        setStage("loading-ffmpeg");
        const ffmpeg = await loadFFmpeg();
        if (abortRef.current) return null;
        setProgress(10);

        // 2. Fetch audio
        setStage("downloading-clips");
        const audioRes = await fetch(params.audioUrl);
        if (!audioRes.ok) throw new Error("Failed to download voiceover audio");
        const audioBlob = await audioRes.blob();
        if (abortRef.current) return null;
        setProgress(20);

        // 3. Render
        setStage("rendering");
        const videoBlob = await renderAiVideo(
          ffmpeg,
          params.clips,
          audioBlob,
          {
            targetWidth: 720,
            targetHeight: 1280,
            onProgress: (p) => {
              setProgress(20 + Math.round(p * 60));
            },
          }
        );
        if (abortRef.current) return null;
        setProgress(80);

        // 4. Upload to server
        setStage("uploading");
        const formData = new FormData();
        formData.append("video", videoBlob, "ai-video.mp4");
        formData.append("script", params.script);

        const uploadRes = await fetch("/api/ai-video/upload-render", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          throw new Error(err.error || "Upload failed");
        }
        const data = await uploadRes.json();
        if (!data.success || !data.url) {
          throw new Error("Upload returned invalid response");
        }
        if (abortRef.current) return null;

        setProgress(100);
        setStage("done");
        setOutputUrl(data.url);
        toast.success("Your AI video is ready!");
        return data.url;
      } catch (err: any) {
        const msg = err?.message || "Video rendering failed";
        setError(msg);
        setStage("error");
        toast.error(msg);
        return null;
      }
    },
    []
  );

  return {
    stage,
    progress,
    stageLabel: STAGE_LABELS[stage],
    isRendering: stage !== "idle" && stage !== "done" && stage !== "error",
    error,
    outputUrl,
    render,
  };
}

export { shouldUseServerFallback };
