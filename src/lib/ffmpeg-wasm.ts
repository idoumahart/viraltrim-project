/**
 * FFmpeg.wasm wrapper for browser-side video processing.
 *
 * This module lazy-loads FFmpeg from CDN and provides helpers for:
 * - Trimming video segments
 * - Cropping to 9:16 (or other ratios)
 * - Burning subtitles/captions
 * - Scaling for mobile performance
 *
 * Usage:
 *   const ffmpeg = await loadFFmpeg();
 *   const result = await trimVideo(ffmpeg, file, 10, 15);
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Singleton — only load FFmpeg once per session
let ffmpegInstance: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

const BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
const MT_BASE_URL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd";

/**
 * Detect if the browser supports multithreaded WASM.
 * Requires SharedArrayBuffer + Atomics.
 */
function supportsMultithreading(): boolean {
  try {
    return (
      typeof SharedArrayBuffer !== "undefined" &&
      typeof Atomics !== "undefined"
    );
  } catch {
    return false;
  }
}

/**
 * Lazy-load FFmpeg.wasm from CDN.
 * Uses multithreaded core if supported, single-threaded otherwise.
 */
export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg();

    const useMT = supportsMultithreading();
    const base = useMT ? MT_BASE_URL : BASE_URL;

    // Listen for logs (useful for debugging)
    if (import.meta.env.DEV) {
      ffmpeg.on("log", ({ message }) => {
        // eslint-disable-next-line no-console
        console.log(`[ffmpeg] ${message}`);
      });
    }

    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(
          `${base}/ffmpeg-core.wasm`,
          "application/wasm"
        ),
      });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    } catch (e) {
      loadingPromise = null;
      throw e;
    }
  })();

  return loadingPromise;
}

/**
 * Extract a segment from a video file using -c copy (no re-encode).
 * Fastest option — use when no filters are needed.
 */
export async function trimVideo(
  ffmpeg: FFmpeg,
  inputFile: File | Blob | string,
  startSec: number,
  endSec: number
): Promise<Blob> {
  const duration = endSec - startSec;

  await ffmpeg.writeFile("input.mp4", await fetchFile(inputFile));

  await ffmpeg.exec([
    "-ss",
    String(startSec),
    "-i",
    "input.mp4",
    "-t",
    String(duration),
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "output.mp4",
  ]);

  const data = await ffmpeg.readFile("output.mp4");
  await ffmpeg.deleteFile("input.mp4");
  await ffmpeg.deleteFile("output.mp4");

  return new Blob([data], { type: "video/mp4" });
}

/**
 * Render a clip with crop, scale, and optional subtitle burn.
 * Re-encodes the video — slower but supports all filters.
 *
 * @param ffmpeg       Loaded FFmpeg instance
 * @param inputFile    Source video file
 * @param startSec     Start time in seconds
 * @param endSec       End time in seconds
 * @param options      Crop, scale, and subtitle options
 */
export async function renderClip(
  ffmpeg: FFmpeg,
  inputFile: File | Blob | string,
  startSec: number,
  endSec: number,
  options: {
    /** Target aspect ratio: "9/16" | "16/9" | "1/1" | "4/5" */
    aspectRatio?: string;
    /** Face center X (0-1) for intelligent crop. Omit for center crop. */
    cropCenterX?: number;
    /** Max height for performance (720 recommended, 480 for mobile) */
    maxHeight?: number;
    /** ASS subtitle content to burn in */
    assContent?: string;
    /** CRF quality (lower = better, 23 default, 28 for speed) */
    crf?: number;
    /** Preset speed (ultrafast recommended for browser) */
    preset?: string;
    /** Callback for progress updates (0-1) */
    onProgress?: (progress: number) => void;
  }
): Promise<Blob> {
  const {
    aspectRatio = "9/16",
    cropCenterX,
    maxHeight = 720,
    assContent,
    crf = 28,
    preset = "ultrafast",
    onProgress,
  } = options;

  const duration = endSec - startSec;

  // Parse aspect ratio
  const [wRatio, hRatio] = aspectRatio.split("/").map(Number);
  const targetRatio = wRatio / hRatio;

  // Build filter chain
  const filters: string[] = [];

  // 1. Scale down for performance + memory
  filters.push(`scale=-1:${maxHeight}`);

  // 2. Calculate crop dimensions
  // After scaling to maxHeight, the height is maxHeight.
  // Crop width = height * targetRatio
  const cropW = `ih*(${wRatio}/${hRatio})`;

  // 3. Calculate crop X offset
  let cropX: string;
  if (cropCenterX !== undefined && cropCenterX !== null) {
    // Face-centered: position the crop so face is in center
    // cropX = faceX * inputWidth - cropWidth/2
    // But we need to express this in FFmpeg expression syntax
    // After scaling, width varies. We'll use the scaled dimensions.
    // Simplified: center the crop, then offset based on face position
    const offset = Math.max(-0.3, Math.min(0.3, cropCenterX - 0.5)); // clamp drift
    cropX = `(iw-${cropW})/2 + iw*${offset.toFixed(3)}`;
  } else {
    cropX = `(iw-${cropW})/2`;
  }

  // Clamp cropX so we don't go off-screen
  const clampedCropX = `max(0,min(${cropX},iw-${cropW}))`;
  filters.push(`crop=${cropW}:ih:${clampedCropX}:0`);

  // 4. Optional subtitle burn
  if (assContent) {
    await ffmpeg.writeFile("subtitles.ass", new TextEncoder().encode(assContent));
    filters.push("subtitles=subtitles.ass");
  }

  const vfChain = filters.join(",");

  // Set up progress listener
  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(progress);
  };
  ffmpeg.on("progress", progressHandler);

  await ffmpeg.writeFile("input.mp4", await fetchFile(inputFile));

  await ffmpeg.exec([
    "-ss",
    String(startSec),
    "-i",
    "input.mp4",
    "-t",
    String(duration),
    "-vf",
    vfChain,
    "-c:v",
    "libx264",
    "-crf",
    String(crf),
    "-preset",
    preset,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    "output.mp4",
  ]);

  ffmpeg.off("progress", progressHandler);

  const data = await ffmpeg.readFile("output.mp4");

  // Cleanup
  await ffmpeg.deleteFile("input.mp4");
  await ffmpeg.deleteFile("output.mp4");
  if (assContent) {
    await ffmpeg.deleteFile("subtitles.ass");
  }

  return new Blob([data], { type: "video/mp4" });
}

/**
 * Extract audio from a video file (for browser Whisper).
 */
export async function extractAudio(
  ffmpeg: FFmpeg,
  inputFile: File | Blob | string,
  outputFormat: "mp3" | "wav" = "mp3"
): Promise<Blob> {
  await ffmpeg.writeFile("input.mp4", await fetchFile(inputFile));

  const codec = outputFormat === "wav" ? "pcm_s16le" : "libmp3lame";
  const ext = outputFormat;
  const ar = outputFormat === "wav" ? "16000" : "44100";

  await ffmpeg.exec([
    "-i",
    "input.mp4",
    "-vn",
    "-acodec",
    codec,
    "-ar",
    ar,
    "-ac",
    "1",
    `audio.${ext}`,
  ]);

  const data = await ffmpeg.readFile(`audio.${ext}`);
  await ffmpeg.deleteFile("input.mp4");
  await ffmpeg.deleteFile(`audio.${ext}`);

  const mimeType = outputFormat === "wav" ? "audio/wav" : "audio/mpeg";
  return new Blob([data], { type: mimeType });
}

/**
 * Generate an ASS subtitle file from grouped word data.
 */
export function generateASS(
  groups: Array<{ text: string; start: number; end: number }>,
  options: {
    playResX?: number;
    playResY?: number;
    fontSize?: number;
    fontColor?: string;
    outlineColor?: string;
    boxColor?: string;
    alignment?: number; // 2 = bottom center
  } = {}
): string {
  const {
    playResX = 1080,
    playResY = 1920,
    fontSize = 80,
    fontColor = "&H00FFFFFF",
    outlineColor = "&H00000000",
    boxColor = "&H00000000",
    alignment = 2,
  } = options;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}

[v4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},${fontColor},${outlineColor},${boxColor},1,${alignment},10,10,200,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const formatTime = (s: number): string => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const cs = Math.floor((s % 1) * 100);
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  const lines = groups.map((g) => {
    const start = formatTime(g.start);
    const end = formatTime(g.end);
    const text = g.text.trim().toUpperCase();
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  });

  return header + lines.join("\n") + "\n";
}

/**
 * Group individual words into readable caption chunks.
 */
export function groupWords(
  words: Array<{ word: string; start: number; end: number }>,
  maxWords = 4,
  maxDuration = 1.5
): Array<{ text: string; start: number; end: number }> {
  const groups: Array<{ text: string; start: number; end: number }> = [];
  let current: Array<{ word: string; start: number; end: number }> = [];

  words.forEach((w, i) => {
    current.push(w);

    const startTime = current[0].start;
    const endTime = w.end;
    const duration = endTime - startTime;

    if (
      current.length >= maxWords ||
      duration >= maxDuration ||
      i === words.length - 1
    ) {
      const nextWord = words[i + 1];
      const normalizedEnd = nextWord ? nextWord.start : endTime;

      groups.push({
        text: current.map((cw) => cw.word.trim().toUpperCase()).join(" "),
        start: startTime,
        end: normalizedEnd,
      });
      current = [];
    }
  });

  return groups;
}

/**
 * Render an AI-generated video from stock clips + voiceover audio.
 * Concatenates clips, trims to segment durations, overlays audio.
 *
 * @param ffmpeg       Loaded FFmpeg instance
 * @param clips        Array of { url, duration } for each stock clip
 * @param audioBlob    ElevenLabs TTS audio blob
 * @param options      Resolution, quality, progress callback
 */
export async function renderAiVideo(
  ffmpeg: FFmpeg,
  clips: Array<{ url: string; duration: number }>,
  audioBlob: Blob,
  options: {
    targetWidth?: number;
    targetHeight?: number;
    crf?: number;
    preset?: string;
    onProgress?: (progress: number) => void;
  } = {}
): Promise<Blob> {
  const {
    targetWidth = 720,
    targetHeight = 1280,
    crf = 28,
    preset = "ultrafast",
  } = options;

  // Download all clips
  const clipBlobs: Blob[] = [];
  for (let i = 0; i < clips.length; i++) {
    const res = await fetch(clips[i].url);
    if (!res.ok) throw new Error(`Failed to download clip ${i + 1}`);
    clipBlobs.push(await res.blob());
  }

  // Write clips to FFmpeg FS
  for (let i = 0; i < clipBlobs.length; i++) {
    await ffmpeg.writeFile(`clip_${i}.mp4`, await fetchFile(clipBlobs[i]));
  }

  // Write audio
  await ffmpeg.writeFile("audio.mp3", await fetchFile(audioBlob));

  // Build filter_complex: scale/pad each clip, trim to duration, concat
  const scalePad = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`;

  const filterParts: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const dur = clips[i].duration;
    filterParts.push(
      `[${i}:v]${scalePad},trim=duration=${dur},setpts=PTS-STARTPTS[v${i}]`
    );
  }
  const concatInputs = clips.map((_, i) => `[v${i}]`).join("");
  filterParts.push(`${concatInputs}concat=n=${clips.length}:v=1:a=0[outv]`);

  const filterComplex = filterParts.join(";");

  // Build input args
  const inputArgs: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    inputArgs.push("-i", `clip_${i}.mp4`);
  }
  inputArgs.push("-i", "audio.mp3");

  // Progress listener
  const progressHandler = ({ progress }: { progress: number }) => {
    options.onProgress?.(progress);
  };
  ffmpeg.on("progress", progressHandler);

  try {
    await ffmpeg.exec([
      "-y",
      ...inputArgs,
      "-filter_complex", filterComplex,
      "-map", "[outv]",
      "-map", `${clips.length}:a`,
      "-c:v", "libx264",
      "-crf", String(crf),
      "-preset", preset,
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "-movflags", "+faststart",
      "-pix_fmt", "yuv420p",
      "output.mp4",
    ]);

    const data = await ffmpeg.readFile("output.mp4");
    return new Blob([data], { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", progressHandler);
    for (let i = 0; i < clips.length; i++) {
      await ffmpeg.deleteFile(`clip_${i}.mp4`).catch(() => {});
    }
    await ffmpeg.deleteFile("audio.mp3").catch(() => {});
    await ffmpeg.deleteFile("output.mp4").catch(() => {});
  }
}

/**
 * Check if the device is low-powered (should use server fallback).
 */
export function shouldUseServerFallback(): boolean {
  // Check device memory
  const memory = (navigator as any).deviceMemory;
  if (memory && memory < 4) return true;

  // Check if mobile
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  if (isMobile) return true;

  // Check hardware concurrency (CPU cores)
  const cores = navigator.hardwareConcurrency;
  if (cores && cores <= 2) return true;

  return false;
}
