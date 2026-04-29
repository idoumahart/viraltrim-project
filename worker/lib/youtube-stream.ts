/**
 * Fetch YouTube direct stream URLs via InnerTube API.
 * These URLs point to googlevideo.com CDN and can be downloaded from
 * any IP — including Cloud Run — bypassing YouTube's datacenter IP blocks.
 *
 * We try multiple InnerTube clients because YouTube's bot detection
 * varies by client. If one client blocks us, another may still work.
 */

const INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";

interface StreamFormat {
  itag: number;
  url: string;
  mimeType: string;
  qualityLabel: string;
  width: number;
  height: number;
  bitrate?: number;
}

export interface StreamInfo {
  videoUrl: string;
  videoOnlyUrl?: string;
  audioOnlyUrl?: string;
  itag: number;
  qualityLabel: string;
}

interface InnerTubeClient {
  name: string;
  userAgent: string;
  clientName: string;
  clientVersion: string;
  clientId: string;
  extraContext?: Record<string, unknown>;
}

const INNERTUBE_CLIENTS: InnerTubeClient[] = [
  {
    name: "ANDROID",
    userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 14)",
    clientName: "ANDROID",
    clientVersion: "20.10.38",
    clientId: "3",
    extraContext: {
      androidSdkVersion: 34,
      osName: "Android",
      osVersion: "14",
    },
  },
  {
    name: "ANDROID_EMBEDDED_PLAYER",
    userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 14)",
    clientName: "ANDROID_EMBEDDED_PLAYER",
    clientVersion: "20.10.38",
    clientId: "55",
    extraContext: {
      androidSdkVersion: 34,
      osName: "Android",
      osVersion: "14",
      clientScreen: "EMBED",
    },
  },
  {
    name: "IOS",
    userAgent: "com.google.ios.youtube/20.10.38 (iPhone; U; CPU iOS 17_0 like Mac OS X)",
    clientName: "IOS",
    clientVersion: "20.10.38",
    clientId: "5",
    extraContext: {
      deviceModel: "iPhone16,2",
      osName: "iOS",
      osVersion: "17.0",
    },
  },
  {
    name: "WEB",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    clientName: "WEB",
    clientVersion: "2.20240709.00.00",
    clientId: "1",
    extraContext: {
      hl: "en",
      gl: "US",
    },
  },
  {
    name: "TV_EMBEDDED",
    userAgent: "Mozilla/5.0 (PlayStation; PlayStation 5/2.0) AppleWebKit/605.1.15",
    clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    clientVersion: "2.0",
    clientId: "85",
    extraContext: {
      clientScreen: "WATCH",
      thirdParty: { embedUrl: "https://www.youtube.com" },
    },
  },
];

/**
 * Generate a plausible visitorData protobuf for InnerTube requests.
 */
function generateVisitorData(): string {
  const idChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = "";
  for (let i = 0; i < 11; i++) {
    id += idChars.charAt(Math.floor(Math.random() * idChars.length));
  }

  const ts = Math.floor(Date.now() / 1000);
  const varint: number[] = [];
  let n = ts;
  while (n > 0x7F) {
    varint.push((n & 0x7F) | 0x80);
    n >>>= 7;
  }
  varint.push(n);

  const idBytes = new TextEncoder().encode(id);
  const buf = new Uint8Array(1 + 1 + idBytes.length + 1 + varint.length);
  let p = 0;

  buf[p++] = 0x0A;
  buf[p++] = idBytes.length;
  buf.set(idBytes, p);
  p += idBytes.length;

  buf[p++] = 0x28;
  for (const b of varint) {
    buf[p++] = b;
  }

  const binary = String.fromCharCode(...buf.slice(0, p));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function tryInnerTubeClient(
  videoId: string,
  client: InnerTubeClient
): Promise<StreamInfo | null> {
  try {
    const visitorData = generateVisitorData();

    const resp = await fetch(INNERTUBE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": client.userAgent,
        "X-Goog-Visitor-Id": visitorData,
        "X-YouTube-Client-Name": client.clientId,
        "X-YouTube-Client-Version": client.clientVersion,
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: "https://www.youtube.com",
        Referer: `https://www.youtube.com/watch?v=${videoId}`,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: client.clientName,
            clientVersion: client.clientVersion,
            visitorData,
            ...client.extraContext,
          },
        },
        videoId,
      }),
    });

    if (!resp.ok) {
      console.log(`[yt-stream:${client.name}] HTTP ${resp.status}`);
      return null;
    }

    const data = (await resp.json()) as any;

    if (data.playabilityStatus?.status !== "OK") {
      console.log(
        `[yt-stream:${client.name}] Not playable: ${data.playabilityStatus?.status} — ${data.playabilityStatus?.reason}`
      );
      return null;
    }

    const formats: StreamFormat[] = data.streamingData?.formats || [];
    const adaptive: StreamFormat[] = data.streamingData?.adaptiveFormats || [];

    if (formats.length === 0 && adaptive.length === 0) {
      console.log(`[yt-stream:${client.name}] No stream formats`);
      return null;
    }

    // Prefer combined video+audio formats
    const combined =
      formats.find((f) => f.itag === 22 && f.url) ||
      formats.find((f) => f.itag === 18 && f.url) ||
      formats.find((f) => f.mimeType?.includes("video/mp4") && f.url) ||
      formats[0];

    if (!combined || !combined.url) {
      console.log(`[yt-stream:${client.name}] No usable combined format`);
      return null;
    }

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
      `[yt-stream:${client.name}] Success itag=${combined.itag} (${combined.qualityLabel})`
    );
    return result;
  } catch (e: any) {
    console.warn(`[yt-stream:${client.name}] Exception: ${e?.message || String(e)}`);
    return null;
  }
}

/**
 * Get direct stream URLs for a YouTube video.
 * Tries multiple InnerTube clients in order until one succeeds.
 */
export async function getYoutubeStreamUrls(
  videoId: string
): Promise<StreamInfo | null> {
  console.log(`[yt-stream] Fetching stream URLs for ${videoId}`);

  for (const client of INNERTUBE_CLIENTS) {
    const result = await tryInnerTubeClient(videoId, client);
    if (result) {
      console.log(`[yt-stream] Using ${client.name} client`);
      return result;
    }
  }

  console.error(`[yt-stream] All InnerTube clients failed for ${videoId}`);
  return null;
}
