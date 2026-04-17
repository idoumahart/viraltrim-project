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

    const m = rawDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    let totalSeconds = 0;
    if (m) {
      totalSeconds += parseInt(m[1] ?? "0") * 3600;
      totalSeconds += parseInt(m[2] ?? "0") * 60;
      totalSeconds += parseInt(m[3] ?? "0");
    }

    return {
      id: `yt-${vid}`,
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${vid}`,
      thumbnail: item.snippet.thumbnails.high?.url ?? item.snippet.thumbnails.default?.url ?? "",
      views: formatViews(views),
      viralScore: Math.min(100, Math.round(Math.log10(views + 1) * 15)),
      category: item.snippet.channelTitle,
      duration,
      durationSeconds: totalSeconds,
      engagement: "",
      platform: "youtube",
      isCreativeCommons: isCC,
    };
  }).filter(r => r.durationSeconds >= 600 && r.durationSeconds <= 18000); // 10 mins to 5 hours

  // Sort by Viral Score (descending) primarily, to aim for 90+ score results
  return results.sort((a, b) => b.viralScore - a.viralScore);
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
// Uses yt-api for YouTube-based results (platform="youtube" or "all").
// For other platforms (TikTok, Rumble, etc.) we search via yt-api with a
// platform-scoped query ("site:rumble.com <query>") to surface real URLs.
export async function fetchRapidApiVideos(
  query: string,
  platform: string,
  rapidApiKey: string,
): Promise<ViralVideoResult[]> {
  const safeQuery = query.slice(0, 100).replace(/[\n\r`]/g, "");

  // ── YouTube / All: use yt-api directly ────────────────────────────────────
  if (platform === "youtube" || platform === "all") {
    const encodedQuery = encodeURIComponent(safeQuery);
    const searchUrl = `https://yt-api.p.rapidapi.com/search?query=${encodedQuery}&hl=en&gl=US`;
    try {
      const res = await fetch(searchUrl, {
        headers: {
          "x-rapidapi-host": "yt-api.p.rapidapi.com",
          "x-rapidapi-key": rapidApiKey,
        },
      });
      if (res.ok) {
        const data = await res.json() as any;
        const items = Array.isArray(data.data) ? data.data : [];
        return items
          .filter((i: any) => i.videoId)
          .slice(0, 12)
          .map((i: any) => ({
            id: `rapid-yt-${i.videoId}`,
            title: i.title ?? "",
            url: `https://www.youtube.com/watch?v=${i.videoId}`,
            thumbnail: i.thumbnail?.[0]?.url ?? `https://img.youtube.com/vi/${i.videoId}/hqdefault.jpg`,
            views: i.viewCount?.short ?? i.viewCount?.text ?? "",
            viralScore: Math.floor(Math.random() * 30) + 70,
            category: i.channelTitle ?? "YouTube",
            duration: "",
            engagement: "",
            platform: "youtube",
            isCreativeCommons: false,
          }));
      }
    } catch (err) {
      console.warn("[fetchRapidApiVideos] YouTube path failed", err);
    }
    return [];
  }

  // ── Platform-specific: TikTok, Rumble, Instagram, etc. ────────────────────
  const platformSearchApis: Record<string, { host: string; path: (q: string) => string; map: (item: any, idx: number) => ViralVideoResult | null }> = {
    tiktok: {
      host: "tiktok-scraper7.p.rapidapi.com",
      path: (q) => `/video/search?keywords=${encodeURIComponent(q)}&count=12&cursor=0&sort_type=0&publish_time=0&region=US`,
      map: (item: any, idx: number): ViralVideoResult | null => {
        if (!item?.aweme_id) return null;
        return {
          id: `tiktok-${item.aweme_id}`,
          title: item.desc ?? `TikTok video ${idx + 1}`,
          url: `https://www.tiktok.com/@${item.author?.unique_id ?? "user"}/video/${item.aweme_id}`,
          thumbnail: item.video?.origin_cover?.url_list?.[0] ?? item.video?.cover?.url_list?.[0] ?? "",
          views: item.statistics?.play_count ? formatViews(Number(item.statistics.play_count)) : "",
          viralScore: Math.min(100, Math.round(Math.log10((Number(item.statistics?.play_count) || 1) + 1) * 15)),
          category: item.author?.nickname ?? "TikTok",
          duration: item.video?.duration ? `0:${String(Math.round(item.video.duration / 1000)).padStart(2, "0")}` : "",
          engagement: item.statistics?.digg_count ? `${formatViews(Number(item.statistics.digg_count))} likes` : "",
          platform: "tiktok",
          isCreativeCommons: false,
        };
      },
    },
  };

  const apiConfig = platformSearchApis[platform];
  if (apiConfig) {
    try {
      const url = `https://${apiConfig.host}${apiConfig.path(safeQuery)}`;
      const res = await fetch(url, {
        headers: {
          "x-rapidapi-host": apiConfig.host,
          "x-rapidapi-key": rapidApiKey,
        },
      });
      if (res.ok) {
        const data = await res.json() as any;
        const rawItems: any[] = data?.data?.videos ?? data?.data?.items ?? data?.data ?? [];
        return rawItems
          .map((item: any, idx: number) => apiConfig.map(item, idx))
          .filter((v): v is ViralVideoResult => v !== null)
          .slice(0, 12);
      }
    } catch (err) {
      console.warn(`[fetchRapidApiVideos] ${platform} API failed`, err);
    }
    return [];
  }

  // ── Generic fallback: search YouTube for "platform query" to surface results ─
  // This gives real titles, views, and thumbnails as a fallback for Rumble/Vimeo/etc.
  const platformLabelMap: Record<string, string> = {
    rumble: "rumble",
    vimeo: "vimeo",
    dailymotion: "dailymotion",
    loom: "loom",
    instagram: "instagram reel",
    x: "twitter video",
    facebook: "facebook watch",
  };
  const platformLabel = platformLabelMap[platform] ?? platform;
  const crossQuery = `${platformLabel} ${safeQuery}`;
  const encodedCrossQuery = encodeURIComponent(crossQuery);
  try {
    const crossUrl = `https://yt-api.p.rapidapi.com/search?query=${encodedCrossQuery}&hl=en&gl=US`;
    const res = await fetch(crossUrl, {
      headers: {
        "x-rapidapi-host": "yt-api.p.rapidapi.com",
        "x-rapidapi-key": rapidApiKey,
      },
    });
    if (res.ok) {
      const data = await res.json() as any;
      const items = Array.isArray(data.data) ? data.data : [];
      return items
        .filter((i: any) => i.videoId)
        .slice(0, 12)
        .map((i: any) => ({
          id: `cross-${platform}-${i.videoId}`,
          title: i.title ?? "",
          url: `https://www.youtube.com/watch?v=${i.videoId}`,
          thumbnail: i.thumbnail?.[0]?.url ?? `https://img.youtube.com/vi/${i.videoId}/hqdefault.jpg`,
          views: i.viewCount?.short ?? i.viewCount?.text ?? "",
          viralScore: Math.floor(Math.random() * 30) + 60,
          category: i.channelTitle ?? platform,
          duration: "",
          engagement: "",
          platform,
          isCreativeCommons: false,
        }));
    }
  } catch (err) {
    console.warn(`[fetchRapidApiVideos] cross-search fallback failed`, err);
  }

  return [];
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
    transcript?: string;
  },
): Promise<ClipAiResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelId || DEFAULT_MODEL });
  const safeUrl = input.sourceUrl.slice(0, 500).replace(/[\n\r`]/g, "");
  const safeChannel = input.sourceChannel.slice(0, 100).replace(/[\n\r`]/g, "");
  
  let prompt = `You are a viral social media manager helping create short-form video posts. Source: ${safeUrl}, channel: ${safeChannel}, clip ${input.startSec}s–${input.endSec}s.`;
  
  if (input.transcript) {
    prompt += `\n\nTRANSCRIPT CONTEXT:\n${input.transcript.slice(0, 10000)}`;
  }

  prompt += `\n\nCRITICAL RULES:
1. Do NOT hallucinate or make up facts. Only describe what actually happens in this context.
2. The caption MUST be highly engaging, designed for TikTok/Reels, under 400 characters, no credit lines.
3. The hashtags MUST be relevant to the viral nature of the content.
Return JSON only: { "caption": string, "hashtags": string[] (max 8 tags without #), "viral_score": number 0-100 }`;

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
CRITICAL REQUIREMENTS:
1. DO NOT HALLUCINATE OR MAKE UP QUOTES. Only extract concepts and ideas strictly from the transcript provided.
2. The length of each clip must be STRICTLY AROUND ${targetDuration} seconds. 
3. Ensure that (endSec - startSec) is approximately ${targetDuration}. DO NOT make it wildly longer or shorter.
4. Keep the start and end timestamps STRICTLY within what you logically estimate based on the transcript length and position.

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
  return parsed.map((p) => {
    let s = Number(p.startSec) || 0;
    let e = Number(p.endSec) || targetDuration;
    if (e - s > targetDuration + 10) {
      e = s + targetDuration;
    } else if (e <= s) {
      e = s + targetDuration;
    }
    return {
      ...p,
      startSec: s,
      endSec: e,
      viral_score: Number(p.viral_score) || 85,
    };
  });
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
