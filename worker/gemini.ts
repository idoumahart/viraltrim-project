import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_MODEL = "gemini-2.5-flash";

// ─── Shared ViralVideo shape ──────────────────────────────────────────────────
export interface ViralVideoResult {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  views: string;
  viralScore: number;
  category: string;
  duration: string;
  engagement: string;
  platform: string;
  isCreativeCommons: boolean;
}

// ─── YouTube Data API v3 ──────────────────────────────────────────────────────
// No CC filter — all content is returned. CC-licensed videos are sorted first.
export async function fetchYouTubeVideos(
  query: string,
  apiKey: string,
): Promise<ViralVideoResult[]> {
  const encodedQuery = encodeURIComponent(query.slice(0, 100).replace(/[\n\r`]/g, ""));

  // Step 1: search for videos
  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&type=video&maxResults=18&q=${encodedQuery}` +
    `&key=${apiKey}`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) throw new Error(`YouTube search failed: ${searchRes.status}`);
  const searchData = (await searchRes.json()) as {
    items: Array<{
      id: { videoId: string };
      snippet: {
        title: string;
        channelTitle: string;
        thumbnails: { high?: { url: string }; default?: { url: string } };
      };
    }>;
  };

  if (!searchData.items?.length) return [];

  const videoIds = searchData.items.map((i) => i.id.videoId).join(",");

  // Step 2: fetch statistics + contentDetails (for duration + CC status)
  const detailUrl =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=statistics,contentDetails,status&id=${videoIds}&key=${apiKey}`;

  const detailRes = await fetch(detailUrl);
  const detailData = (await detailRes.json()) as {
    items: Array<{
      id: string;
      statistics?: { viewCount?: string };
      contentDetails?: { duration?: string; licensedContent?: boolean };
      status?: { license?: string };
    }>;
  };

  const statsMap = new Map<string, (typeof detailData.items)[number]>();
  for (const item of detailData.items ?? []) statsMap.set(item.id, item);

  const results: ViralVideoResult[] = searchData.items.map((item) => {
    const vid = item.id.videoId;
    const detail = statsMap.get(vid);
    const views = Number(detail?.statistics?.viewCount ?? 0);
    const isCC = detail?.status?.license === "creativeCommon";
    const rawDuration = detail?.contentDetails?.duration ?? "PT0S";
    const duration = parseIsoDuration(rawDuration);

    return {
      id: `yt-${vid}`,
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${vid}`,
      thumbnail: item.snippet.thumbnails.high?.url ?? item.snippet.thumbnails.default?.url ?? "",
      views: formatViews(views),
      viralScore: Math.min(100, Math.round(Math.log10(views + 1) * 15)),
      category: item.snippet.channelTitle,
      duration,
      engagement: "",
      platform: "youtube",
      isCreativeCommons: isCC,
    };
  });

  // Sort CC-licensed to front — all content is accessible
  return results.sort((a, b) => (b.isCreativeCommons ? 1 : 0) - (a.isCreativeCommons ? 1 : 0));
}

// ─── Reddit JSON API (no key needed) ─────────────────────────────────────────
export async function fetchRedditVideos(
  query: string,
): Promise<ViralVideoResult[]> {
  const safeQuery = encodeURIComponent(query.slice(0, 100).replace(/[\n\r`]/g, ""));
  const url =
    `https://www.reddit.com/search.json?q=${safeQuery}&type=link&sort=hot&limit=25`;

  const res = await fetch(url, {
    headers: { "User-Agent": "ViralTrim/1.0" },
  });
  if (!res.ok) throw new Error(`Reddit search failed: ${res.status}`);

  const data = (await res.json()) as {
    data: {
      children: Array<{
        data: {
          id: string;
          title: string;
          url: string;
          thumbnail: string;
          is_video: boolean;
          score: number;
          subreddit: string;
          permalink: string;
        };
      }>;
    };
  };

  return (
    data.data.children
      .filter((c) => c.data.is_video || c.data.url.includes("v.redd.it"))
      .slice(0, 12)
      .map((c) => ({
        id: `reddit-${c.data.id}`,
        title: c.data.title,
        url: `https://www.reddit.com${c.data.permalink}`,
        thumbnail:
          c.data.thumbnail?.startsWith("http") ? c.data.thumbnail : "",
        views: "",
        viralScore: Math.min(100, Math.round(Math.log10(c.data.score + 1) * 20)),
        category: `r/${c.data.subreddit}`,
        duration: "",
        engagement: `${c.data.score} upvotes`,
        platform: "reddit",
        isCreativeCommons: false,
      }))
  );
}

// ─── RapidAPI multi-platform video search ─────────────────────────────────────
// Uses a general social video downloader/search API available on RapidAPI.
// The specific endpoint depends on which RapidAPI product is subscribed.
// Here we use the "Social Media Video Downloader" pattern used by yt-dlp-based APIs.
export async function fetchRapidApiVideos(
  query: string,
  platform: string,
  rapidApiKey: string,
): Promise<ViralVideoResult[]> {
  // RapidAPI "All Social Media Video Downloader" search endpoint
  const safeQuery = encodeURIComponent(query.slice(0, 100).replace(/[\n\r`]/g, ""));
  const url = `https://social-media-video-downloader.p.rapidapi.com/smvd/get/all?url=${safeQuery}`;

  // For search-based discovery (not a single URL download), use the trending/search approach
  // Using "YouTube Video and Shorts Downloader" API as fallback for cross-platform search
  const searchUrl =
    `https://yt-api.p.rapidapi.com/search?query=${safeQuery}&hl=en&gl=US`;

  const res = await fetch(searchUrl, {
    headers: {
      "x-rapidapi-host": "yt-api.p.rapidapi.com",
      "x-rapidapi-key": rapidApiKey,
    },
  });
  if (!res.ok) throw new Error(`RapidAPI search failed: ${res.status}`);

  const data = (await res.json()) as {
    data?: Array<{
      videoId?: string;
      title?: string;
      thumbnail?: Array<{ url: string }>;
      viewCount?: { short?: string; text?: string };
      channelTitle?: string;
    }>;
  };

  return (
    data.data
      ?.filter((i) => i.videoId)
      .slice(0, 12)
      .map((i) => ({
        id: `rapid-${platform}-${i.videoId}`,
        title: i.title ?? "",
        url: `https://www.youtube.com/watch?v=${i.videoId}`,
        thumbnail: i.thumbnail?.[0]?.url ?? "",
        views: i.viewCount?.short ?? i.viewCount?.text ?? "",
        viralScore: 70,
        category: i.channelTitle ?? platform,
        duration: "",
        engagement: "",
        platform,
        isCreativeCommons: false,
      })) ?? []
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function parseIsoDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = parseInt(m[1] ?? "0");
  const min = parseInt(m[2] ?? "0");
  const s = parseInt(m[3] ?? "0");
  if (h > 0) return `${h}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${min}:${String(s).padStart(2, "0")}`;
}

export interface ClipAiResult {
  caption: string;
  hashtags: string[];
  viral_score: number;
}

export async function generateClipMetadata(
  apiKey: string,
  modelId: string | undefined,
  input: {
    sourceUrl: string;
    sourceChannel: string;
    startSec: number;
    endSec: number;
  },
): Promise<ClipAiResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelId || DEFAULT_MODEL });
  const safeUrl = input.sourceUrl.slice(0, 500).replace(/[\n\r`]/g, "");
  const safeChannel = input.sourceChannel.slice(0, 100).replace(/[\n\r`]/g, "");
  const prompt = `You help create short-form video posts. Source: ${safeUrl}, channel: ${safeChannel}, clip ${input.startSec}s–${input.endSec}s.
Return JSON only: { "caption": string (engaging, under 400 chars, no credit line), "hashtags": string[] (max 8 tags without #), "viral_score": number 0-100 }`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as ClipAiResult;
  if (!parsed.caption || !Array.isArray(parsed.hashtags)) {
    throw new Error("Invalid clip AI response");
  }
  return parsed;
}

export interface HookSuggestion {
  concept: string;
  startSec: number;
  endSec: number;
  viral_score: number;
  caption: string;
}

export async function generateHookSuggestions(
  apiKey: string,
  modelId: string | undefined,
  transcript: string,
  targetDuration: number,
): Promise<HookSuggestion[]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelId || DEFAULT_MODEL });
  
  // Truncate transcript to prevent context overflow. roughly 40,000 chars is safe for Gemini flash
  const truncatedTranscript = transcript.slice(0, 40000);
  
  const prompt = `You are a viral social media manager. I am giving you a raw video transcript. I need you to identify exactly 3 distinct concepts/segments that would make highly viral, engaging standalone short-form clips.
CRITICAL REQUIREMENT: The length of each clip must be STRICTLY AROUND ${targetDuration} seconds. 
Ensure that (endSec - startSec) is approximately ${targetDuration}. DO NOT make it wildly longer or shorter.
Keep the start and end timestamps strictly within what you find in the context. If timestamps aren't strictly numbered, estimate them logically.

Transcript:
"""
${truncatedTranscript}
"""

Return a raw JSON array of 3 objects containing the fields: "concept" (a catchy 3-4 word title), "startSec" (integer), "endSec" (integer), "viral_score" (0-100), and "caption" (engaging and under 200 chars).
Return JSON ONLY, without markdown fences or additional explanation.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as HookSuggestion[];
  
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Invalid hook suggestion response");
  }
  return parsed.map((p) => ({
    ...p,
    // ensure strings are converted if gemini hallucinates strings
    startSec: Number(p.startSec) || 0,
    endSec: Number(p.endSec) || targetDuration,
    viral_score: Number(p.viral_score) || 85,
  }));
}

export async function chatbotReply(
  apiKey: string,
  modelId: string | undefined,
  message: string,
  history: { role: string; content: string }[],
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelId || DEFAULT_MODEL });
  const system = `You are Forge, the in-app assistant for viraltrim (AI viral clipping & scheduling SaaS). Explain features, billing tiers (Free/Pro/Agency), DMCA reporting, affiliates, and troubleshooting. Be concise and accurate.`;
  const recent = history
    .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-12)
    .map((m) => `${m.role}: ${m.content.slice(0, 1000).replace(/[\n\r`]/g, " ")}`)
    .join("\n");
  const safeMessage = message.slice(0, 2000).replace(/[\n\r`]/g, " ");
  const prompt = `${system}\n\nConversation:\n${recent}\nuser: ${safeMessage}\nassistant:`;
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
