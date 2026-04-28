/**
 * Pure-JS YouTube transcript extraction for Cloudflare Workers.
 * Uses the `youtube-transcript` package which hits YouTube's InnerTube API
 * with an Android client context. Cloudflare's edge IPs are not on the
 * same blocklists as GCP/AWS datacenter IPs, so this works where yt-dlp
 * on Cloud Run fails.
 */

import { YoutubeTranscript } from "youtube-transcript";

export interface TranscriptResult {
  text: string;
  segments: Array<{ word: string; start: number; end: number }>;
}

/**
 * Extract YouTube video ID from various URL formats.
 */
export function extractYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  return match?.[1] ?? null;
}

/**
 * Fetch transcript directly from YouTube via InnerTube API.
 * Runs entirely inside the Cloudflare Worker — no Python, no yt-dlp, no Cloud Run.
 */
export async function fetchYoutubeTranscript(
  videoIdOrUrl: string
): Promise<TranscriptResult | null> {
  try {
    console.log(`[yt-transcript] Fetching transcript for: ${videoIdOrUrl}`);

    const raw = await YoutubeTranscript.fetchTranscript(videoIdOrUrl, {
      lang: "en",
    });

    if (!raw || raw.length === 0) {
      console.log("[yt-transcript] No captions found");
      return null;
    }

    // Convert youtube-transcript output to our segment format
    const segments: Array<{ word: string; start: number; end: number }> = [];
    let fullText = "";

    for (const item of raw) {
      const text = item.text.trim();
      if (!text) continue;

      // youtube-transcript gives { text, duration, offset }
      // We approximate word-level timing by splitting text and distributing time
      const words = text.split(/\s+/).filter(Boolean);
      const start = item.offset / 1000; // ms → s
      const end = (item.offset + item.duration) / 1000; // ms → s
      const duration = end - start;
      const wordDuration = words.length > 0 ? duration / words.length : 0;

      for (let i = 0; i < words.length; i++) {
        segments.push({
          word: words[i],
          start: start + i * wordDuration,
          end: start + (i + 1) * wordDuration,
        });
      }

      fullText += (fullText ? " " : "") + text;
    }

    console.log(
      `[yt-transcript] Success: ${fullText.length} chars, ${segments.length} words`
    );
    return { text: fullText, segments };
  } catch (e: any) {
    console.error(`[yt-transcript] Failed: ${e?.message || String(e)}`);
    return null;
  }
}
