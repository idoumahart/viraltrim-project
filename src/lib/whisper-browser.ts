/**
 * Browser-side Whisper transcription using Transformers.js
 * Runs entirely on-device — zero server cost, works offline.
 */

import { pipeline, env } from "@xenova/transformers";

// Use CDN for model files (cached by browser)
env.allowLocalModels = false;
env.useBrowserCache = true;

// Small Whisper model optimized for browser — ~75MB
const MODEL_NAME = "Xenova/whisper-tiny";
// For better accuracy use "Xenova/whisper-base" (~150MB) or "Xenova/whisper-small" (~500MB)

let whisperPipeline: any = null;
let modelLoading = false;
let modelLoadPromise: Promise<any> | null = null;

export interface WhisperWord {
  text: string;
  start: number; // seconds
  end: number;   // seconds
  confidence: number;
}

export interface WhisperSegment {
  text: string;
  start: number;
  end: number;
  words: WhisperWord[];
}

export async function loadWhisperModel(onProgress?: (progress: number) => void): Promise<any> {
  if (whisperPipeline) return whisperPipeline;
  if (modelLoadPromise) return modelLoadPromise;

  modelLoading = true;
  modelLoadPromise = pipeline("automatic-speech-recognition", MODEL_NAME, {
    dtype: "fp32", // fp32 is most compatible; "q8" for faster inference on some devices
    device: "cpu", // WebGPU support is experimental; stick to CPU for reliability
    progress_callback: (p: any) => {
      if (onProgress && typeof p === "number") onProgress(Math.min(1, Math.max(0, p)));
      else if (onProgress && p?.status === "progress") {
        const pct = p.loaded / (p.total || 1);
        onProgress(Math.min(1, Math.max(0, pct)));
      }
    },
  }).then((pipe: any) => {
    whisperPipeline = pipe;
    modelLoading = false;
    return pipe;
  }).catch((err: any) => {
    modelLoading = false;
    modelLoadPromise = null;
    throw err;
  });

  return modelLoadPromise;
}

export function isWhisperModelLoaded(): boolean {
  return !!whisperPipeline;
}

export function isWhisperModelLoading(): boolean {
  return modelLoading;
}

/**
 * Transcribe audio from a Blob (e.g., extracted by FFmpeg.wasm)
 * Returns word-level timestamps for caption generation.
 */
export async function transcribeAudio(
  audioBlob: Blob,
  options: {
    language?: string;      // e.g., "en", auto-detect if omitted
    returnTimestamps?: boolean;
    onProgress?: (progress: number) => void;
  } = {}
): Promise<WhisperSegment[]> {
  const { language, returnTimestamps = true, onProgress } = options;

  const pipe = await loadWhisperModel(onProgress);

  // Convert Blob to ArrayBuffer → Float32Array (mono, 16kHz assumed)
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const channelData = audioBuffer.getChannelData(0); // Mono

  // Chunk if audio is very long (>30s chunks) to avoid OOM
  const MAX_SAMPLES = 30 * 16000; // 30 seconds at 16kHz
  const results: WhisperSegment[] = [];

  for (let offset = 0; offset < channelData.length; offset += MAX_SAMPLES) {
    const chunk = channelData.slice(offset, offset + MAX_SAMPLES);
    const chunkOffsetSec = offset / 16000;

    const output: any = await pipe(chunk, {
      return_timestamps: returnTimestamps ? "word" : false,
      language,
      task: "transcribe",
    });

    // Parse output format
    const chunks: any[] = output.chunks || [];
    const text: string = output.text || "";

    if (chunks.length > 0) {
      // Word-level timestamps available
      const words: WhisperWord[] = [];
      for (const c of chunks) {
        const wText = (c.text || "").trim();
        if (!wText) continue;
        const ts = c.timestamp;
        const start = (Array.isArray(ts) ? ts[0] : 0) + chunkOffsetSec;
        const end = (Array.isArray(ts) ? ts[1] : (ts || 0)) + chunkOffsetSec;
        words.push({
          text: wText,
          start: Math.max(0, start),
          end: Math.max(0, end),
          confidence: c.confidence ?? 0.9,
        });
      }

      // Group words into segments
      const segmentTexts: string[] = [];
      const segmentWords: WhisperWord[][] = [];
      let currentSeg: WhisperWord[] = [];
      for (const w of words) {
        currentSeg.push(w);
        if (w.text.endsWith(".") || w.text.endsWith("!") || w.text.endsWith("?") || currentSeg.length >= 8) {
          segmentWords.push(currentSeg);
          segmentTexts.push(currentSeg.map(cw => cw.text).join(" "));
          currentSeg = [];
        }
      }
      if (currentSeg.length > 0) {
        segmentWords.push(currentSeg);
        segmentTexts.push(currentSeg.map(cw => cw.text).join(" "));
      }

      for (let i = 0; i < segmentWords.length; i++) {
        const segWords = segmentWords[i];
        results.push({
          text: segmentTexts[i],
          start: segWords[0].start,
          end: segWords[segWords.length - 1].end,
          words: segWords,
        });
      }
    } else if (text) {
      // Fallback: no timestamps, just text
      results.push({
        text: text.trim(),
        start: chunkOffsetSec,
        end: chunkOffsetSec + (chunk.length / 16000),
        words: [],
      });
    }
  }

  await audioContext.close();
  return results;
}

/**
 * Convenience: extract audio from video Blob via FFmpeg.wasm, then transcribe.
 */
export async function transcribeVideo(
  ffmpeg: any, // FFmpeg instance
  videoBlob: Blob,
  options?: Parameters<typeof transcribeAudio>[1]
): Promise<WhisperSegment[]> {
  const { extractAudio } = await import("./ffmpeg-wasm");
  const audioBlob = await extractAudio(ffmpeg, videoBlob);
  return transcribeAudio(audioBlob, options);
}
