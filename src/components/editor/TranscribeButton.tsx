import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { loadFFmpeg, extractAudio } from "@/lib/ffmpeg-wasm";
import { isWhisperModelLoaded } from "@/lib/whisper-browser";
import { cn } from "@/lib/utils";

interface TranscribeButtonProps {
  videoUrl: string;
  startSec: number;
  endSec: number;
  onTranscript: (lines: string[]) => void;
}

export function TranscribeButton({ videoUrl, startSec, endSec, onTranscript }: TranscribeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [stage, setStage] = useState("");

  const handleTranscribe = useCallback(async () => {
    if (!videoUrl) {
      toast.error("No video loaded");
      return;
    }
    if (endSec - startSec > 120) {
      toast.error("Browser transcription is limited to 2-minute clips. Trim your clip first.");
      return;
    }

    setLoading(true);
    try {
      setModelLoading(true);
      setStage("Downloading Whisper model (~75MB)…");
      const { loadWhisperModel, transcribeAudio: transcribe } = await import("@/lib/whisper-browser");
      await loadWhisperModel((p) => {
        if (p < 1) setStage(`Downloading model… ${Math.round(p * 100)}%`);
      });
      setModelLoading(false);

      setStage("Extracting audio…");
      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok) throw new Error("Failed to fetch video");
      const videoBlob = await videoRes.blob();

      const ffmpeg = await loadFFmpeg();
      const audioBlob = await extractAudio(ffmpeg, videoBlob);
      setStage("Transcribing with AI…");

      const segments = await transcribe(audioBlob, { returnTimestamps: true });

      if (segments.length === 0) {
        toast.info("No speech detected in this clip.");
        return;
      }

      // Map to caption lines (one per segment)
      const lines = segments.map((s) => s.text.trim()).filter(Boolean);
      onTranscript(lines);
      toast.success(`Transcribed ${lines.length} caption lines!`);
    } catch (err: any) {
      console.error("[transcribe] Failed:", err);
      toast.error("Transcription failed: " + (err?.message || "Unknown error"));
    } finally {
      setLoading(false);
      setStage("");
      setModelLoading(false);
    }
  }, [videoUrl, startSec, endSec, onTranscript]);

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className={cn(
          "w-full border-white/10 text-white/70 hover:bg-white/5 hover:text-white gap-2",
          loading && "opacity-80"
        )}
        onClick={handleTranscribe}
        disabled={loading || !videoUrl}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
        {loading ? (stage || "Transcribing…") : (isWhisperModelLoaded() ? "Transcribe with AI" : "Transcribe with AI (download model)")}
      </Button>
      {(loading || modelLoading) && stage && (
        <p className="text-[10px] text-white/30 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {stage}
        </p>
      )}
      <p className="text-[10px] text-white/20">
        Runs entirely in your browser. No audio leaves your device.
      </p>
    </div>
  );
}
