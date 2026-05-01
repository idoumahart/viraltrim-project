import type { Hono } from "hono";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateId } from "./auth";
import type { Env } from "./core-utils";
import type { AppEnv } from "./types/app-env";

const DEFAULT_MODEL = "gemini-2.5-flash";

// ─── Script Generation ────────────────────────────────────────────────────────

export async function generateVideoScript(topic: string, tone: string, duration: number, apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: DEFAULT_MODEL });

  const prompt = `Write a ${duration}-second viral video script about: "${topic}".
Tone: ${tone}.

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
    };
    const topic = String(body.topic || "").trim();
    if (!topic) {
      return c.json({ success: false, error: "Topic is required" }, 400);
    }
    if (!c.env.GEMINI_API_KEY) {
      return c.json({ success: false, error: "AI service unavailable" }, 503);
    }

    try {
      const result = await generateVideoScript(
        topic,
        body.tone || "viral",
        body.duration || 30,
        c.env.GEMINI_API_KEY
      );
      return c.json({ success: true, ...result });
    } catch (e: any) {
      console.error("[ai-video/script] error:", e.message);
      return c.json({ success: false, error: "Script generation failed" }, 500);
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
      const data = await res.json() as { voices: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> };
      return c.json({ success: true, voices: data.voices || [] });
    } catch (e: any) {
      console.error("[ai-video/voices] error:", e.message);
      return c.json({ success: false, error: e.message || "Failed to fetch voices" }, 500);
    }
  });

  // GET /api/ai-video/pexels
  api.get("/api/ai-video/pexels", async (c) => {
    const q = c.req.query("q") || "";
    const perPage = Math.min(parseInt(c.req.query("per_page") || "12", 10), 24);
    if (!q.trim()) {
      return c.json({ success: false, error: "Query is required" }, 400);
    }
    if (!c.env.PEXELS_API_KEY) {
      return c.json({ success: false, error: "Stock footage service unavailable" }, 503);
    }

    try {
      const videos = await searchPexelsVideos(q, c.env.PEXELS_API_KEY, perPage);
      const clips = videos.map((v) => {
        const best = pickBestVideoFile(v);
        return {
          id: String(v.id),
          url: best?.url || v.url,
          thumbnail: v.video_pictures?.[0]?.picture || "",
          duration: v.duration,
          width: best?.width || v.width,
          height: best?.height || v.height,
        };
      }).filter((c) => c.url);
      return c.json({ success: true, clips });
    } catch (e: any) {
      console.error("[ai-video/pexels] error:", e.message);
      return c.json({ success: false, error: "Stock footage search failed" }, 500);
    }
  });

  // POST /api/ai-video/render
  api.post("/api/ai-video/render", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      script?: string;
      voiceId?: string;
      clips?: string[];
      segments?: Array<{ text: string; duration: number }>;
      audioUrl?: string;
    };
    if (!body.script || !body.clips?.length) {
      return c.json({ success: false, error: "Script and clips are required" }, 400);
    }

    const clips = body.clips;
    const segments = body.segments || [];
    const jobId = `av-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = c.get("user");

    // Store initial job status in KV
    await c.env.CACHE.put(
      `ai-video:${jobId}`,
      JSON.stringify({ status: "queued", userId: user.id, createdAt: Date.now() }),
      { expirationTtl: 3600 }
    );

    // If Cloud Run renderer is available, trigger it in background
    if (c.env.RENDERER_URL) {
      c.executionCtx?.waitUntil(
        (async () => {
          try {
            await c.env.CACHE.put(
              `ai-video:${jobId}`,
              JSON.stringify({ status: "rendering", userId: user.id, progress: 10, createdAt: Date.now() }),
              { expirationTtl: 3600 }
            );

            const secret = c.env.INTERNAL_WEBHOOK_SECRET;
            const renderResp = await fetch(`${c.env.RENDERER_URL}/render-ai-video`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(secret ? { "X-Internal-Secret": secret } : {}),
              },
              body: JSON.stringify({
                clips: clips.map((url, i) => ({
                  url,
                  duration: segments[i]?.duration || 5,
                })),
                audioUrl: body.audioUrl,
                script: body.script,
                segments,
              }),
              signal: AbortSignal.timeout(300000),
            });

            if (!renderResp.ok) {
              const errText = await renderResp.text();
              console.error(`[ai-video/render] Cloud Run failed: ${errText}`);
              await c.env.CACHE.put(
                `ai-video:${jobId}`,
                JSON.stringify({ status: "error", userId: user.id, error: errText, createdAt: Date.now() }),
                { expirationTtl: 3600 }
              );
              return;
            }

            const data = await renderResp.json() as any;
            if (data.success && data.url) {
              await c.env.CACHE.put(
                `ai-video:${jobId}`,
                JSON.stringify({ status: "done", userId: user.id, url: data.url, createdAt: Date.now() }),
                { expirationTtl: 3600 }
              );
            } else {
              await c.env.CACHE.put(
                `ai-video:${jobId}`,
                JSON.stringify({ status: "error", userId: user.id, error: data.error || "Render failed", createdAt: Date.now() }),
                { expirationTtl: 3600 }
              );
            }
          } catch (e: any) {
            console.error(`[ai-video/render] background error: ${e.message}`);
            await c.env.CACHE.put(
              `ai-video:${jobId}`,
              JSON.stringify({ status: "error", userId: user.id, error: e.message, createdAt: Date.now() }),
              { expirationTtl: 3600 }
            );
          }
        })()
      );
    }

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

    const user = c.get("user");
    const id = generateId();
    const key = `ai-videos/${user.id}/${id}.mp4`;

    try {
      const buf = await video.arrayBuffer();
      await c.env.MEDIA.put(key, buf, {
        httpMetadata: { contentType: video.type || "video/mp4" },
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

    if (!cached) {
      return c.json({ success: false, error: "Job not found" }, 404);
    }

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
  });
}
