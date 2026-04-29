/**
 * YouTube transcript extraction for Cloudflare Workers.
 *
 * Strategy (most reliable first):
 * 1. Direct /api/timedtext XML fetch — mimics YouTube's own player caption load.
 *    This endpoint is what youtube.com uses internally and is less aggressively
 *    blocked than the InnerTube get_transcript endpoint.
 * 2. youtube-transcript npm package (InnerTube fallback).
 * 3. Return null so caller can fall back to Whisper / manual paste.
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
    /(?:youtube\.com\/(?:[^\/]+\/.+\/(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  return match?.[1] ?? null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

/**
 * Try fetching captions from YouTube's /api/timedtext endpoint.
 * This is the same endpoint YouTube's web player hits when loading captions.
 * It returns XML (srv3 format) which we parse into transcript text.
 *
 * We try several language variants because auto-generated captions may be
 * tagged as en, en-US, or en-GB depending on the video.
 */
async function fetchTimedTextTranscript(
  videoId: string
): Promise<TranscriptResult | null> {
  const variants = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US&fmt=srv3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-GB&fmt=srv3`,
    // Some videos only expose auto-generated captions under kind=asr
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=srv3`,
  ];

  for (const url of variants) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "*/*",
          Referer: `https://www.youtube.com/watch?v=${videoId}`,
        },
        redirect: "follow",
      });

      if (!resp.ok) {
        console.log(`[timedtext] HTTP ${resp.status} for ${url}`);
        continue;
      }

      const xml = await resp.text();
      if (!xml.includes("<text")) {
        console.log(`[timedtext] No <text> tags in response for ${url}`);
        continue;
      }

      const segments: Array<{ word: string; start: number; end: number }> = [];
      let fullText = "";

      // Parse <text start="0.24" dur="3.12">Caption text</text>
      const regex = /<text start="([^"]+)" dur="([^"]*)"[^>]*>(.*?)<\/text>/gs;
      let match;

      while ((match = regex.exec(xml)) !== null) {
        const start = parseFloat(match[1]);
        const dur = parseFloat(match[2] || "0");
        const rawText = decodeHtmlEntities(match[3]).trim();

        if (!rawText) continue;

        fullText += (fullText ? " " : "") + rawText;

        // Approximate word-level timing
        const words = rawText.split(/\s+/).filter(Boolean);
        const wordDuration = words.length > 0 ? dur / words.length : 0;

        for (let i = 0; i < words.length; i++) {
          segments.push({
            word: words[i],
            start: start + i * wordDuration,
            end: start + (i + 1) * wordDuration,
          });
        }
      }

      if (fullText.length > 0) {
        console.log(
          `[timedtext] Success: ${fullText.length} chars, ${segments.length} words`
        );
        return { text: fullText, segments };
      }
    } catch (e: any) {
      console.warn(`[timedtext] Exception for ${url}:`, e.message);
    }
  }

  return null;
}

/**
 * Fetch transcript via InnerTube using the youtube-transcript npm package.
 * This is the fallback when /api/timedtext doesn't return captions.
 */
async function fetchInnerTubeTranscript(
  videoIdOrUrl: string
): Promise<TranscriptResult | null> {
  try {
    console.log(`[yt-transcript] InnerTube fallback for: ${videoIdOrUrl}`);

    const raw = await YoutubeTranscript.fetchTranscript(videoIdOrUrl, {
      lang: "en",
    });

    if (!raw || raw.length === 0) {
      console.log("[yt-transcript] No captions found via InnerTube");
      return null;
    }

    const segments: Array<{ word: string; start: number; end: number }> = [];
    let fullText = "";

    for (const item of raw) {
      const text = item.text.trim();
      if (!text) continue;

      const words = text.split(/\s+/).filter(Boolean);
      const start = item.offset / 1000;
      const end = (item.offset + item.duration) / 1000;
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
      `[yt-transcript] InnerTube success: ${fullText.length} chars, ${segments.length} words`
    );
    return { text: fullText, segments };
  } catch (e: any) {
    console.error(`[yt-transcript] InnerTube failed:`, e?.message || String(e));
    return null;
  }
}

/**
 * Fetch transcript with layered fallback:
 * 1. /api/timedtext (mimics real YouTube player)
 * 2. InnerTube via youtube-transcript package
 * 3. null → caller should fall back to Whisper or manual paste
 */
export async function fetchYoutubeTranscript(
  videoIdOrUrl: string
): Promise<TranscriptResult | null> {
  const videoId = extractYoutubeId(videoIdOrUrl) || videoIdOrUrl;

  // Layer 1: timedtext (most reliable, mimics real player)
  const timedText = await fetchTimedTextTranscript(videoId);
  if (timedText) return timedText;

  // Layer 2: InnerTube fallback
  const innerTube = await fetchInnerTubeTranscript(videoIdOrUrl);
  if (innerTube) return innerTube;

  console.error(`[yt-transcript] All methods failed for ${videoId}`);
  return null;
}
