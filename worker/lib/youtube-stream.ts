/**
 * Fetch YouTube direct stream URLs via InnerTube API (Android client).
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
  videoUrl: string;      // Best video+audio combined format
  videoOnlyUrl?: string; // Best video-only format (for high quality)
  audioOnlyUrl?: string; // Best audio-only format
  itag: number;
  qualityLabel: string;
}

/**
 * Get direct stream URLs for a YouTube video.
 * Uses the Android InnerTube client which is less aggressively blocked.
 */
export async function getYoutubeStreamUrls(
  videoId: string
): Promise<StreamInfo | null> {
  try {
    console.log(`[yt-stream] Fetching stream URLs for ${videoId}`);

    const resp = await fetch(INNERTUBE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ANDROID_USER_AGENT,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
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
