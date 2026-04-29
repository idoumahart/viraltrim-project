/**
 * Fetch YouTube direct stream URLs via InnerTube API.
 * These URLs point to googlevideo.com CDN and can be downloaded from
 * any IP — including Cloud Run — bypassing YouTube's datacenter IP blocks.
 */

const INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const ANDROID_USER_AGENT = "com.google.android.youtube/20.10.38 (Linux; U; Android 14)";

interface StreamFormat {
  itag: number;
  url: string;
  mimeType: string;
  qualityLabel: string;
  width: number;
  height: number;
}

export interface StreamInfo {
  videoUrl: string;
  videoOnlyUrl?: string;
  audioOnlyUrl?: string;
  itag: number;
  qualityLabel: string;
}

/**
 * Generate a plausible visitorData protobuf for InnerTube requests.
 * visitorData is a base64-encoded protobuf with id + timestamp fields.
 * YouTube uses this to track sessions; providing one reduces bot flags.
 */
function generateVisitorData(): string {
  // Protobuf wire format:
  // Field 1 (string id): tag = (1 << 3) | 2 = 0x0A, then length-prefixed string
  // Field 5 (int32 ts):  tag = (5 << 3) | 0 = 0x28, then varint
  const idChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = "";
  for (let i = 0; i < 11; i++) {
    id += idChars.charAt(Math.floor(Math.random() * idChars.length));
  }

  const ts = Math.floor(Date.now() / 1000);

  // Encode varint for timestamp
  const varint: number[] = [];
  let n = ts;
  while (n > 0x7F) {
    varint.push((n & 0x7F) | 0x80);
    n >>>= 7;
  }
  varint.push(n);

  // Build protobuf bytes
  const idBytes = new TextEncoder().encode(id);
  const buf = new Uint8Array(1 + 1 + idBytes.length + 1 + varint.length);
  let p = 0;

  buf[p++] = 0x0A; // field 1, wire type 2 (length-delimited)
  buf[p++] = idBytes.length;
  buf.set(idBytes, p);
  p += idBytes.length;

  buf[p++] = 0x28; // field 5, wire type 0 (varint)
  for (const b of varint) {
    buf[p++] = b;
  }

  // Base64 URL-safe encode
  const binary = String.fromCharCode(...buf.slice(0, p));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Get direct stream URLs for a YouTube video.
 * Uses the Android InnerTube client with visitorData to appear more like
 * a real device and reduce bot-detection flags.
 */
export async function getYoutubeStreamUrls(
  videoId: string
): Promise<StreamInfo | null> {
  try {
    console.log(`[yt-stream] Fetching stream URLs for ${videoId}`);

    const visitorData = generateVisitorData();

    const resp = await fetch(INNERTUBE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ANDROID_USER_AGENT,
        "X-Goog-Visitor-Id": visitorData,
        "X-YouTube-Client-Name": "3",
        "X-YouTube-Client-Version": "20.10.38",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
            androidSdkVersion: 34,
            osName: "Android",
            osVersion: "14",
            visitorData,
          },
        },
        videoId,
      }),
    });

    if (!resp.ok) {
      console.error(`[yt-stream] InnerTube API error: ${resp.status}`);
      return null;
    }

    const data = (await resp.json()) as any;

    if (data.playabilityStatus?.status !== "OK") {
      console.error(
        `[yt-stream] Video not playable: ${data.playabilityStatus?.status} — ${data.playabilityStatus?.reason}`
      );
      return null;
    }

    const formats: StreamFormat[] = data.streamingData?.formats || [];
    const adaptive: StreamFormat[] = data.streamingData?.adaptiveFormats || [];

    if (formats.length === 0 && adaptive.length === 0) {
      console.error("[yt-stream] No stream formats found");
      return null;
    }

    // Prefer combined video+audio formats (simpler for download)
    // itag 22 = 720p MP4 (combined), itag 18 = 360p MP4 (combined)
    const combined =
      formats.find((f) => f.itag === 22) ||
      formats.find((f) => f.itag === 18) ||
      formats.find((f) => f.mimeType?.includes("video/mp4") && f.url) ||
      formats[0];

    if (!combined) {
      console.error("[yt-stream] No usable combined format found");
      return null;
    }

    // Also grab best video-only and audio-only for potential high-quality use
    const videoOnly = adaptive
      .filter((f) => f.mimeType?.startsWith("video/") && f.url)
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0];

    const audioOnly = adaptive
      .filter((f) => f.mimeType?.startsWith("audio/") && f.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

    const result: StreamInfo = {
      videoUrl: combined.url,
      itag: combined.itag,
      qualityLabel: combined.qualityLabel,
    };

    if (videoOnly) result.videoOnlyUrl = videoOnly.url;
    if (audioOnly) result.audioOnlyUrl = audioOnly.url;

    console.log(
      `[yt-stream] Got itag=${combined.itag} (${combined.qualityLabel}) for ${videoId}`
    );
    return result;
  } catch (e: any) {
    console.error(`[yt-stream] Failed: ${e?.message || String(e)}`);
    return null;
  }
}
