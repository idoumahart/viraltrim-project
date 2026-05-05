import type { Hono } from "hono";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateId } from "./auth";
import type { Env } from "./core-utils";
import type { AppEnv } from "./types/app-env";
import { createDatabase } from "./database";
import { aiVideoRenders } from "./database/schema";
import { eq, desc } from "drizzle-orm";
import { logBackgroundTask } from "./middleware/request-logger";
import { fetchYouTubeVideos, fetchRedditVideos } from "./gemini";
import { checkAiVideoRateLimit, checkExpensiveRateLimit } from "./rate-limit";

const DEFAULT_MODEL = "gemini-2.5-flash";

// Inject current date into every Gemini prompt so models use up-to-date information
function createGeminiModel(apiKey: string, modelId?: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const today = new Date().toISOString().split("T")[0];
  return genAI.getGenerativeModel({
    model: modelId || DEFAULT_MODEL,
    systemInstruction: `Today's date is ${today}. Use current, up-to-date information and avoid outdated references.`,
  });
}

// ─── Script Generation ────────────────────────────────────────────────────────

async function researchTopic(topic: string, env: Env): Promise<string> {
  const results: string[] = [];
  try {
    if (env.YOUTUBE_API_KEY) {
      const yt = await fetchYouTubeVideos(topic, env.YOUTUBE_API_KEY);
      if (yt.length > 0) {
        results.push("YOUTUBE RESEARCH:\n" + yt.slice(0, 5).map(v => `- ${v.title} (${v.views} views)`).join("\n"));
      }
    }
  } catch { /* ignore */ }
  try {
    const rd = await fetchRedditVideos(topic);
    if (rd.length > 0) {
      results.push("REDDIT DISCUSSIONS:\n" + rd.slice(0, 5).map(r => `- ${r.title}`).join("\n"));
    }
  } catch { /* ignore */ }
  return results.join("\n\n");
}

export async function generateVideoScript(
  topic: string,
  tone: string,
  duration: number,
  apiKey: string,
  researchContext = "",
  creativeMode = false,
) {
  const model = createGeminiModel(apiKey);

  let prompt = "";
  if (creativeMode) {
    prompt = `Write a ${duration}-second viral video script about: "${topic}".
Tone: ${tone}.

This is CREATIVE/FICTIONAL mode. You may use imagination and storytelling.

Rules:
- Write for spoken voiceover (natural, conversational)
- Each sentence should be punchy and engaging
- Total reading time should be approximately ${duration} seconds
- Include a strong hook in the first 3 seconds
- End with a call-to-action
- Format as plain text paragraphs, one sentence per line for easy parsing
- Do NOT include stage directions, camera notes, or sound effects
- Do NOT use markdown formatting

Script:`;
  } else {
    prompt = `Write a ${duration}-second viral video script about: "${topic}".
Tone: ${tone}.

CRITICAL: This is FACTUAL/RESEARCH mode. You MUST base the script on verified facts from the research context below. Do NOT hallucinate statistics, names, dates, or events. If the research is insufficient, state facts conservatively and focus on generally accepted knowledge.

${researchContext ? `RESEARCH CONTEXT:\n${researchContext}\n\n` : ""}
Rules:
- Write for spoken voiceover (natural, conversational)
- Each sentence should be punchy and engaging
- Total reading time should be approximately ${duration} seconds
- Include a strong hook in the first 3 seconds
- End with a call-to-action
- Format as plain text paragraphs, one sentence per line for easy parsing
- Do NOT include stage directions, camera notes, or sound effects
- Do NOT use markdown formatting
- ONLY state facts that are supported by the research context or widely known general knowledge

Script:`;
  }

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Parse into segments
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const segments = sentences.map((sentence) => ({
    text: sentence + ".",
    duration: Math.max(2, Math.ceil(sentence.split(/\s+/).length / 2.5)),
  }));

  return { script: text, segments };
}

async function extractVisualKeywords(script: string, segments: Array<{ text: string; duration: number }>, apiKey: string): Promise<Array<{ segmentIndex: number; keywords: string }>> {
  const model = createGeminiModel(apiKey);

  const prompt = `Given this video script, extract the best Pexels stock video search keyword for EACH segment. Keywords should be visual and concrete (e.g., "city skyline", "person typing", "ocean waves"). Avoid abstract concepts.

Script:
"""${script}"""

Segments:
${segments.map((s, i) => `${i + 1}. "${s.text}"`).join("\n")}

Return ONLY a JSON array in this exact format:
[
  {"segmentIndex": 0, "keywords": "keyword phrase"},
  {"segmentIndex": 1, "keywords": "keyword phrase"}
]`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Array<{ segmentIndex: number; keywords: string }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e: any) {
    console.error("[extractVisualKeywords] failed:", e.message);
    return segments.map((_, i) => ({ segmentIndex: i, keywords: "" }));
  }
}

async function generateVideoPromptsForFal(
  segments: Array<{ text: string; duration: number }>,
  apiKey: string
): Promise<Array<{ segmentIndex: number; prompt: string }>> {
  const model = createGeminiModel(apiKey);

  const prompt = `For each video segment below, write a concise text-to-video prompt (max 20 words) for an AI video generator. The prompt should describe a single cinematic motion scene. No text/words in the video. Emphasize camera movement and motion.

Segments:
${segments.map((s, i) => `${i + 1}. "${s.text}"`).join("\n")}

Return ONLY a JSON array:
[
  {"segmentIndex": 0, "prompt": "cinematic motion scene description"},
  {"segmentIndex": 1, "prompt": "cinematic motion scene description"}
]`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Array<{ segmentIndex: number; prompt: string }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e: any) {
    console.error("[generateVideoPromptsForFal] failed:", e.message);
    return segments.map((_, i) => ({ segmentIndex: i, prompt: "cinematic scene" }));
  }
}

async function generateSceneImages(segments: Array<{ text: string; duration: number }>, apiKey: string): Promise<Array<{ segmentIndex: number; imageUrl: string; prompt: string }>> {
  const model = createGeminiModel(apiKey);

  const prompt = `For each video segment below, write a concise image generation prompt (max 15 words) suitable for an AI image generator. The prompt should describe a single cinematic scene. No text/words in the image.

Segments:
${segments.map((s, i) => `${i + 1}. "${s.text}"`).join("\n")}

Return ONLY a JSON array:
[
  {"segmentIndex": 0, "prompt": "cinematic scene description"},
  {"segmentIndex": 1, "prompt": "cinematic scene description"}
]`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const prompts = JSON.parse(cleaned) as Array<{ segmentIndex: number; prompt: string }>;

    return await Promise.all(
      (Array.isArray(prompts) ? prompts : []).map(async (p) => {
        const encoded = encodeURIComponent(p.prompt);
        // Pollinations.ai - free, no API key, no watermark option
        const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=720&height=1280&seed=${42 + p.segmentIndex}&nologo=true&negative=blur,text,watermark,logo`;
        return { segmentIndex: p.segmentIndex, imageUrl, prompt: p.prompt };
      })
    );
  } catch (e: any) {
    console.error("[generateSceneImages] failed:", e.message);
    return [];
  }
}

// ─── ElevenLabs TTS ───────────────────────────────────────────────────────────

export async function generateElevenLabsTTS(text: string, voiceId: string, apiKey: string): Promise<ArrayBuffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const payload = {
    text,
    model_id: "eleven_multilingual_v2",
    output_format: "mp3_44100_128" as const,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errText: string;
    try {
      const errJson = await res.json() as any;
      errText = JSON.stringify(errJson);
    } catch {
      errText = await res.text();
    }
    throw new Error(`ElevenLabs TTS ${res.status}: ${errText}`);
  }

  return res.arrayBuffer();
}

// ─── Pexels Stock Video Search ────────────────────────────────────────────────

export interface PexelsVideo {
  id: number;
  url: string;
  video_files: Array<{
    id: number;
    quality: string;
    file_type: string;
    width: number;
    height: number;
    link: string;
  }>;
  video_pictures: Array<{ id: number; picture: string; nr: number }>;
  duration: number;
  width: number;
  height: number;
}

export async function searchPexelsVideos(query: string, apiKey: string, perPage = 12): Promise<PexelsVideo[]> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait`;
  const res = await fetch(url, {
    headers: { Authorization: apiKey },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pexels API failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { videos: PexelsVideo[] };
  return data.videos || [];
}

// ─── Pixabay Integration ──────────────────────────────────────────────────────

interface PixabayVideo {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  duration: number;
  videos: {
    large?: { url: string; width: number; height: number; size: number; thumbnail: string };
    medium?: { url: string; width: number; height: number; size: number; thumbnail: string };
    small?: { url: string; width: number; height: number; size: number; thumbnail: string };
    tiny?: { url: string; width: number; height: number; size: number; thumbnail: string };
  };
  views: number;
  downloads: number;
  likes: number;
  user: string;
  userImageURL: string;
}

export async function searchPixabayVideos(query: string, apiKey: string, perPage = 20): Promise<PixabayVideo[]> {
  const url = `https://pixabay.com/api/videos/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&per_page=${perPage}&orientation=vertical`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pixabay API failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { hits: PixabayVideo[] };
  return data.hits || [];
}

export function pickBestVideoFile(video: PexelsVideo): { url: string; width: number; height: number } | null {
  const files = video.video_files
    .filter((f) => f.file_type === "video/mp4")
    .sort((a, b) => (b.width || 0) - (a.width || 0));

  // Prefer HD but not 4K (too large)
  const hd = files.find((f) => f.width >= 720 && f.width <= 1080);
  const best = hd || files[0];
  if (!best) return null;
  return { url: best.link, width: best.width, height: best.height };
}

// ─── Cloud Run Render ─────────────────────────────────────────────────────────

export async function queueAiVideoRender(
  rendererUrl: string,
  payload: {
    script: string;
    audioUrl: string;
    clips: string[];
    segments: Array<{ text: string; duration: number }>;
    aspectRatio?: string;
  },
  secret?: string
): Promise<{ jobId: string }> {
  const res = await fetch(`${rendererUrl}/render-ai-video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Internal-Secret": secret } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(300000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Render queue failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { jobId: string };
  return data;
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerAiVideoRoutes(api: Hono<AppEnv>) {
  // POST /api/ai-video/script
  api.post("/api/ai-video/script", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      topic?: string;
      tone?: string;
      duration?: number;
      creativeMode?: boolean;
    };
    const topic = String(body.topic || "").trim();
    if (!topic) {
      return c.json({ success: false, error: "Topic is required" }, 400);
    }
    if (!c.env.GEMINI_API_KEY) {
      return c.json({ success: false, error: "AI service unavailable" }, 503);
    }

    try {
      let researchContext = "";
      if (!body.creativeMode) {
        researchContext = await researchTopic(topic, c.env);
      }
      const result = await generateVideoScript(
        topic,
        body.tone || "viral",
        body.duration || 30,
        c.env.GEMINI_API_KEY,
        researchContext,
        body.creativeMode ?? false
      );
      return c.json({ success: true, ...result, researchContext: researchContext ? "Research applied" : undefined });
    } catch (e: any) {
      console.error("[ai-video/script] error:", e.message);
      return c.json({ success: false, error: "Script generation failed" }, 500);
    }
  });

  // POST /api/ai-video/pexels-keywords
  api.post("/api/ai-video/pexels-keywords", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      script?: string;
      segments?: Array<{ text: string; duration: number }>;
    };
    if (!body.script || !body.segments?.length) {
      return c.json({ success: false, error: "Script and segments are required" }, 400);
    }
    if (!c.env.GEMINI_API_KEY) {
      return c.json({ success: false, error: "AI service unavailable" }, 503);
    }

    try {
      const keywords = await extractVisualKeywords(body.script, body.segments, c.env.GEMINI_API_KEY);
      return c.json({ success: true, keywords });
    } catch (e: any) {
      console.error("[ai-video/pexels-keywords] error:", e.message);
      return c.json({ success: false, error: "Keyword extraction failed" }, 500);
    }
  });

  // POST /api/ai-video/generate-images
  api.post("/api/ai-video/generate-images", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      segments?: Array<{ text: string; duration: number }>;
    };
    if (!body.segments?.length) {
      return c.json({ success: false, error: "Segments are required" }, 400);
    }
    if (!c.env.GEMINI_API_KEY) {
      return c.json({ success: false, error: "AI service unavailable" }, 503);
    }

    try {
      const images = await generateSceneImages(body.segments, c.env.GEMINI_API_KEY);
      return c.json({ success: true, images });
    } catch (e: any) {
      console.error("[ai-video/generate-images] error:", e.message);
      return c.json({ success: false, error: "Image generation failed" }, 500);
    }
  });

  // POST /api/ai-video/tts
  api.post("/api/ai-video/tts", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      text?: string;
      voiceId?: string;
    };
    const text = String(body.text || "").trim();
    const voiceId = String(body.voiceId || "").trim();
    if (!text) {
      return c.json({ success: false, error: "Text is required" }, 400);
    }
    if (!voiceId) {
      return c.json({ success: false, error: "Voice ID is required" }, 400);
    }
    if (!c.env.ELEVENLABS_API_KEY) {
      return c.json({ success: false, error: "Voice service unavailable — ELEVENLABS_API_KEY not set" }, 503);
    }

    try {
      const audio = await generateElevenLabsTTS(text, voiceId, c.env.ELEVENLABS_API_KEY);
      return new Response(audio, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(audio.byteLength),
        },
      });
    } catch (e: any) {
      console.error("[ai-video/tts] error:", e.message);
      return c.json({ success: false, error: e.message || "Voice generation failed" }, 500);
    }
  });

  // GET /api/ai-video/voices
  api.get("/api/ai-video/voices", async (c) => {
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    if (!await checkExpensiveRateLimit(c.env.CACHE, ip)) {
      return c.json({ success: false, error: "Rate limit exceeded. Try again later." }, 429);
    }

    if (!c.env.ELEVENLABS_API_KEY) {
      return c.json({ success: false, error: "Voice service unavailable" }, 503);
    }
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": c.env.ELEVENLABS_API_KEY },
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`ElevenLabs API ${res.status}: ${err}`);
      }
      const data = await res.json() as { voices: Array<{ voice_id: string; name: string; preview_url?: string; labels?: Record<string, string> }> };
      return c.json({ success: true, voices: data.voices || [] });
    } catch (e: any) {
      console.error("[ai-video/voices] error:", e.message);
      return c.json({ success: false, error: e.message || "Failed to fetch voices" }, 500);
    }
  });

  // GET /api/ai-video/pexels
  api.get("/api/ai-video/pexels", async (c) => {
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    if (!await checkExpensiveRateLimit(c.env.CACHE, ip)) {
      return c.json({ success: false, error: "Rate limit exceeded. Try again later." }, 429);
    }

    const q = c.req.query("q") || "";
    const rawPerPage = parseInt(c.req.query("per_page") || "12", 10);
    const perPage = isNaN(rawPerPage) ? 12 : Math.min(Math.max(rawPerPage, 1), 24);

    if (!q.trim()) {
      return c.json({ success: false, error: "Query is required" }, 400);
    }

    const hasPexels = !!c.env.PEXELS_API_KEY;
    const hasPixabay = !!c.env.PIXABAY_API_KEY;
    if (!hasPexels && !hasPixabay) {
      return c.json({ success: false, error: "Stock footage service unavailable" }, 503);
    }

    try {
      const results: Array<{ id: string; url: string; thumbnail: string; duration: number; width: number; height: number; source: string }> = [];

      if (hasPexels) {
        try {
          const videos = await searchPexelsVideos(q, c.env.PEXELS_API_KEY, perPage);
          for (const v of videos) {
            const best = pickBestVideoFile(v);
            if (best?.url) {
              results.push({
                id: `pexels-${v.id}`,
                url: best.url,
                thumbnail: v.video_pictures?.[0]?.picture || "",
                duration: v.duration,
                width: best.width || v.width,
                height: best.height || v.height,
                source: "pexels",
              });
            }
          }
        } catch (e: any) {
          console.error("[ai-video/pexels] Pexels failed:", e.message);
        }
      }

      if (hasPixabay) {
        try {
          const hits = await searchPixabayVideos(q, c.env.PIXABAY_API_KEY, perPage);
          for (const h of hits) {
            const rendition = h.videos?.medium || h.videos?.small || h.videos?.large || h.videos?.tiny;
            if (rendition?.url) {
              results.push({
                id: `pixabay-${h.id}`,
                url: rendition.url,
                thumbnail: h.videos?.medium?.thumbnail || h.videos?.small?.thumbnail || h.userImageURL || "",
                duration: h.duration,
                width: rendition.width,
                height: rendition.height,
                source: "pixabay",
              });
            }
          }
        } catch (e: any) {
          console.error("[ai-video/pexels] Pixabay failed:", e.message);
        }
      }

      if (results.length === 0) {
        return c.json({ success: true, clips: [], message: "No clips found. Try a different search term." });
      }

      return c.json({ success: true, clips: results });
    } catch (e: any) {
      console.error("[ai-video/pexels] error:", e.message);
      return c.json({ success: false, error: "Stock footage search failed" }, 500);
    }
  });

  // POST /api/ai-video/render
  api.post("/api/ai-video/render", async (c) => {
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    if (!await checkExpensiveRateLimit(c.env.CACHE, ip)) {
      return c.json({ success: false, error: "Rate limit exceeded. Try again later." }, 429);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      script?: string;
      voiceId?: string;
      clips?: string[];
      segments?: Array<{ text: string; duration: number }>;
      audioUrl?: string;
    };
    if (!body.script || !body.clips?.length || !body.audioUrl) {
      return c.json({ success: false, error: "Script, clips, and audioUrl are required" }, 400);
    }

    const clips = body.clips;
    const segments = body.segments || [];

    // Safeguards
    if (clips.length > 20) {
      return c.json({ success: false, error: "Max 20 clips allowed" }, 400);
    }
    const totalDuration = segments.reduce((sum, s) => sum + (s.duration || 5), 0);
    if (totalDuration > 300) {
      return c.json({ success: false, error: "Max total duration 300 seconds (5 minutes)" }, 400);
    }
    if (!c.env.RENDERER_URL) {
      return c.json({ success: false, error: "Renderer not configured" }, 503);
    }

    const jobId = `av-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = c.get("user");
    const reqId = (c as any).get?.("reqId") || "unknown";

    // Persist in D1
    const db = createDatabase(c.env.DB);
    await db.insert(aiVideoRenders).values({
      id: jobId,
      userId: user.id,
      status: "queued",
      script: body.script,
      voiceId: body.voiceId || null,
      clips: clips,
    });

    // Store initial job status in KV (for fast polling)
    await c.env.CACHE.put(
      `ai-video:${jobId}`,
      JSON.stringify({ status: "queued", userId: user.id, createdAt: Date.now() }),
      { expirationTtl: 3600 }
    );

    const bgPromise = (async () => {
      try {
        await c.env.CACHE.put(
          `ai-video:${jobId}`,
          JSON.stringify({ status: "rendering", userId: user.id, progress: 10, createdAt: Date.now() }),
          { expirationTtl: 3600 }
        );
        await db.update(aiVideoRenders).set({ status: "processing", progress: 10 }).where(eq(aiVideoRenders.id, jobId));

        // Download clips to R2 temp storage so renderer can reliably fetch them
        const r2PublicBase = c.env.R2_PUBLIC_URL || "https://media.viraltrim.com";
        const proxiedClips: Array<{ url: string; duration: number }> = [];
        for (let i = 0; i < clips.length; i++) {
          const clipUrl = clips[i];
          const duration = segments[i]?.duration || 5;
          try {
            const dl = await fetch(clipUrl, { signal: AbortSignal.timeout(30000), redirect: "follow" });
            if (!dl.ok) throw new Error(`Download failed: ${dl.status}`);
            const blob = await dl.arrayBuffer();
            const tempKey = `temp/${user.id}/${jobId}/clip_${i}.mp4`;
            await c.env.MEDIA.put(tempKey, blob, { httpMetadata: { contentType: "video/mp4" } });
            proxiedClips.push({ url: `${r2PublicBase}/${tempKey}`, duration });
          } catch (e: any) {
            console.error(`[ai-video/render] clip ${i} download failed:`, e.message);
            // Fallback: send original URL and hope renderer can reach it
            proxiedClips.push({ url: clipUrl, duration });
          }
        }

        const secret = c.env.INTERNAL_WEBHOOK_SECRET;
        const renderResp = await fetch(`${c.env.RENDERER_URL}/render-ai-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(secret ? { "X-Internal-Secret": secret } : {}),
          },
          body: JSON.stringify({
            clips: proxiedClips,
            audioUrl: body.audioUrl,
            script: body.script,
            segments,
            webhookUrl: `${c.env.APP_URL || ""}/api/ai-video/renders/${jobId}/status`,
            userId: user.id,
          }),
          signal: AbortSignal.timeout(300000),
        });

        if (!renderResp.ok) {
          const errText = await renderResp.text();
          const safeErr = errText.slice(0, 500).replace(/<[^>]+>/g, "");
          console.error(`[ai-video/render] Cloud Run failed: ${safeErr}`);
          await c.env.CACHE.put(
            `ai-video:${jobId}`,
            JSON.stringify({ status: "error", userId: user.id, error: safeErr, createdAt: Date.now() }),
            { expirationTtl: 3600 }
          );
          await db.update(aiVideoRenders).set({ status: "error", error: safeErr }).where(eq(aiVideoRenders.id, jobId));
          return;
        }

        const data = await renderResp.json() as any;
        if (data.success && data.url) {
          await c.env.CACHE.put(
            `ai-video:${jobId}`,
            JSON.stringify({ status: "done", userId: user.id, url: data.url, createdAt: Date.now() }),
            { expirationTtl: 3600 }
          );
          await db.update(aiVideoRenders).set({ status: "done", outputUrl: data.url, progress: 100 }).where(eq(aiVideoRenders.id, jobId));
        } else {
          const errMsg = data.error || "Render failed";
          await c.env.CACHE.put(
            `ai-video:${jobId}`,
            JSON.stringify({ status: "error", userId: user.id, error: errMsg, createdAt: Date.now() }),
            { expirationTtl: 3600 }
          );
          await db.update(aiVideoRenders).set({ status: "error", error: errMsg }).where(eq(aiVideoRenders.id, jobId));
        }
      } catch (e: any) {
        console.error(`[ai-video/render] background error: ${e.message}`);
        await c.env.CACHE.put(
          `ai-video:${jobId}`,
          JSON.stringify({ status: "error", userId: user.id, error: e.message, createdAt: Date.now() }),
          { expirationTtl: 3600 }
        );
        await db.update(aiVideoRenders).set({ status: "error", error: e.message }).where(eq(aiVideoRenders.id, jobId));
      }
    })();

    c.executionCtx?.waitUntil(logBackgroundTask("ai-video-render", reqId, bgPromise));

    return c.json({ success: true, jobId, status: "queued" });
  });

  // POST /api/ai-video/upload-render
  // Browser fallback: client renders with FFmpeg.wasm, uploads final video here
  api.post("/api/ai-video/upload-render", async (c) => {
    const form = await c.req.formData();
    const video = form.get("video");
    if (!(video instanceof File)) {
      return c.json({ success: false, error: "video file required" }, 400);
    }
    if (!video.type.startsWith("video/")) {
      return c.json({ success: false, error: "Only video files are accepted" }, 400);
    }
    if (video.size > 200 * 1024 * 1024) {
      return c.json({ success: false, error: "Max file size 200MB" }, 413);
    }

    const user = c.get("user");
    const id = generateId();
    const key = `ai-videos/${user.id}/${id}.mp4`;

    try {
      const buf = await video.arrayBuffer();
      await c.env.MEDIA.put(key, buf, {
        httpMetadata: { contentType: "video/mp4" },
      });

      const r2PublicBase = c.env.R2_PUBLIC_URL || "https://media.viraltrim.com";
      const url = `${r2PublicBase}/${key}`;

      return c.json({ success: true, url, key });
    } catch (e: any) {
      console.error("[ai-video/upload-render] error:", e.message);
      return c.json({ success: false, error: "Upload failed" }, 500);
    }
  });

  // GET /api/ai-video/render/:id
  api.get("/api/ai-video/render/:id", async (c) => {
    const jobId = c.req.param("id");
    const cached = await c.env.CACHE.get(`ai-video:${jobId}`);

    if (cached) {
      const data = JSON.parse(cached) as {
        status: string;
        url?: string;
        error?: string;
        progress?: number;
      };
      return c.json({
        success: true,
        status: data.status,
        url: data.url,
        error: data.error,
        progress: data.progress,
      });
    }

    // Fallback to D1
    const db = createDatabase(c.env.DB);
    const row = await db.select().from(aiVideoRenders).where(eq(aiVideoRenders.id, jobId)).limit(1);
    if (!row.length) {
      return c.json({ success: false, error: "Job not found" }, 404);
    }
    const r = row[0];
    return c.json({
      success: true,
      status: r.status,
      url: r.outputUrl,
      error: r.error,
      progress: r.progress,
    });
  });

  // GET /api/ai-video/renders — list user's renders
  api.get("/api/ai-video/renders", async (c) => {
    const user = c.get("user");
    const db = createDatabase(c.env.DB);
    const rows = await db
      .select()
      .from(aiVideoRenders)
      .where(eq(aiVideoRenders.userId, user.id))
      .orderBy(desc(aiVideoRenders.createdAt))
      .limit(50);
    return c.json({ success: true, renders: rows });
  });

  // GET /api/proxy-media — proxy external media URLs to bypass browser CORS
  // Whitelisted to prevent SSRF abuse
  const PROXY_ALLOWLIST = [
    "videos.pexels.com",
    "images.pexels.com",
    "player.vimeo.com",
    "cdn.coverr.co",
    "cdn.pixabay.com",
    "v3.fal.media",
    "fal.media",
    "storage.googleapis.com",
    "media.viraltrim.com",
  ];

  api.get("/api/proxy-media", async (c) => {
    const url = c.req.query("url");
    if (!url) {
      return c.json({ success: false, error: "Missing url parameter" }, 400);
    }
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      return c.json({ success: false, error: "Invalid URL" }, 400);
    }
    const allowed = PROXY_ALLOWLIST.some((h) => hostname === h || hostname.endsWith(`.${h}`));
    if (!allowed) {
      return c.json({ success: false, error: "URL not allowed" }, 403);
    }

    try {
      const resp = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
      if (!resp.ok) {
        return c.json({ success: false, error: `Upstream failed: ${resp.status}` }, 502);
      }
      const contentLength = resp.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > 100 * 1024 * 1024) {
        return c.json({ success: false, error: "File too large" }, 413);
      }
      const contentType = resp.headers.get("content-type") || "application/octet-stream";
      return new Response(resp.body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (e: any) {
      return c.json({ success: false, error: e.message || "Proxy failed" }, 502);
    }
  });

  // POST /api/ai-video/generate-videos — real AI video generation via fal.ai
  api.post("/api/ai-video/generate-videos", async (c) => {
    const user = c.get("user");
    const body = (await c.req.json().catch(() => ({}))) as {
      segments?: Array<{ text: string; duration: number }>;
    };

    if (!body.segments?.length) {
      return c.json({ success: false, error: "Segments are required" }, 400);
    }
    if (body.segments.length > 8) {
      return c.json({ success: false, error: "Max 8 segments allowed" }, 400);
    }
    if (!c.env.FAL_AI_API_KEY) {
      return c.json({ success: false, error: "AI video generation not configured" }, 503);
    }
    if (!c.env.GEMINI_API_KEY) {
      return c.json({ success: false, error: "AI prompt generation not configured" }, 503);
    }

    // Rate limit check (costs real money)
    const rateLimit = await checkAiVideoRateLimit(c.env.CACHE, user.id, user.plan);
    if (!rateLimit.allowed) {
      return c.json({ success: false, error: "AI video limit reached for your plan" }, 429);
    }

    try {
      // Step 1: Generate video prompts via Gemini
      const prompts = await generateVideoPromptsForFal(body.segments, c.env.GEMINI_API_KEY);

      // Step 2: Submit to fal.ai Wan T2V in parallel
      const falResults = await Promise.all(
        prompts.map(async (p) => {
          const res = await fetch("https://queue.fal.run/fal-ai/wan-t2v", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Key ${c.env.FAL_AI_API_KEY}`,
            },
            body: JSON.stringify({
              prompt: p.prompt,
              aspect_ratio: "9:16",
              num_frames: 81, // ~5 seconds at 16fps
            }),
          });
          if (!res.ok) {
            const err = await res.text();
            throw new Error(`fal.ai submit failed: ${res.status} ${err}`);
          }
          const data = await res.json() as { request_id: string };
          return { segmentIndex: p.segmentIndex, requestId: data.request_id };
        })
      );

      // Step 3: Poll all jobs until complete (max ~3 min)
      const videos: Array<{ segmentIndex: number; videoUrl: string; width: number; height: number }> = [];
      const pending = new Set(falResults.map((r) => r.requestId));
      const startTime = Date.now();
      const maxWait = 180_000; // 3 minutes

      while (pending.size > 0 && Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 5000));

        await Promise.all(
          Array.from(pending).map(async (requestId) => {
            const statusRes = await fetch(`https://queue.fal.run/fal-ai/wan-t2v/requests/${requestId}/status`, {
              headers: { "Authorization": `Key ${c.env.FAL_AI_API_KEY}` },
            });
            if (!statusRes.ok) {
              console.error(`[ai-video/generate-videos] status fetch failed for ${requestId}: ${statusRes.status}`);
              return;
            }
            const statusData = await statusRes.json() as { status: string; response_url?: string; error?: string };

            if (statusData.status === "COMPLETED") {
              if (statusData.error) {
                console.error(`[ai-video/generate-videos] fal job failed for ${requestId}: ${statusData.error}`);
                pending.delete(requestId);
                return;
              }
              // Fetch actual result from response_url
              const resultUrl = statusData.response_url || `https://queue.fal.run/fal-ai/wan-t2v/requests/${requestId}`;
              const resultRes = await fetch(resultUrl, {
                headers: { "Authorization": `Key ${c.env.FAL_AI_API_KEY}` },
              });
              if (!resultRes.ok) {
                console.error(`[ai-video/generate-videos] result fetch failed for ${requestId}: ${resultRes.status}`);
                return;
              }
              const resultData = await resultRes.json() as { video?: { url: string }; width?: number; height?: number };
              if (resultData.video?.url) {
                const match = falResults.find((r) => r.requestId === requestId);
                if (match) {
                  videos.push({
                    segmentIndex: match.segmentIndex,
                    videoUrl: resultData.video.url,
                    width: resultData.width || 720,
                    height: resultData.height || 1280,
                  });
                }
                pending.delete(requestId);
              }
            }
          })
        );
      }

      if (videos.length === 0) {
        // Refund rate limit on total failure
        const key = `ai-video:user:${user.id}`;
        const raw = await c.env.CACHE.get(key);
        const n = raw ? Number.parseInt(raw, 10) : 0;
        if (Number.isFinite(n) && n > 0) {
          await c.env.CACHE.put(key, String(n - 1), { expirationTtl: 30 * 24 * 60 * 60 });
        }
        return c.json({ success: false, error: "All video generations failed or timed out" }, 504);
      }

      return c.json({
        success: true,
        videos: videos.sort((a, b) => a.segmentIndex - b.segmentIndex),
        remaining: rateLimit.remaining,
      });
    } catch (e: any) {
      console.error("[ai-video/generate-videos] error:", e.message);
      return c.json({ success: false, error: e.message || "Video generation failed" }, 500);
    }
  });

  // POST /api/ai-video/renders/:id/status — webhook from Cloud Run
  api.post("/api/ai-video/renders/:id/status", async (c) => {
    const jobId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      status?: string;
      url?: string;
      error?: string;
      progress?: number;
    };

    const secret = c.req.header("X-Internal-Secret");
    if (!secret || !c.env.INTERNAL_WEBHOOK_SECRET || secret !== c.env.INTERNAL_WEBHOOK_SECRET) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const db = createDatabase(c.env.DB);
    const row = await db.select().from(aiVideoRenders).where(eq(aiVideoRenders.id, jobId)).limit(1);
    if (!row.length) {
      return c.json({ success: false, error: "Job not found" }, 404);
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.status) updates.status = body.status;
    if (body.url) updates.outputUrl = body.url;
    if (body.error) updates.error = body.error;
    if (typeof body.progress === "number") updates.progress = body.progress;

    await db.update(aiVideoRenders).set(updates).where(eq(aiVideoRenders.id, jobId));

    // Also update KV for fast polling
    const cached = await c.env.CACHE.get(`ai-video:${jobId}`);
    if (cached) {
      const data = JSON.parse(cached);
      Object.assign(data, { status: body.status, url: body.url, error: body.error, progress: body.progress });
      await c.env.CACHE.put(`ai-video:${jobId}`, JSON.stringify(data), { expirationTtl: 3600 });
    }

    return c.json({ success: true });
  });
}
