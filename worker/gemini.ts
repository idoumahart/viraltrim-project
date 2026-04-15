import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_MODEL = "gemini-2.5-flash";

export interface ViralTopicRow {
  title: string;
  channel_name: string;
  estimated_views: string;
  viral_score: number;
  platform_tags: string[];
  youtube_search_url: string;
}

export async function fetchViralDiscoveryJson(
  apiKey: string,
  modelId: string | undefined,
  category: string,
): Promise<ViralTopicRow[]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelId || DEFAULT_MODEL });
  const prompt = `Return a JSON array of 12 trending video topics right now that would perform well as short-form content on TikTok and Instagram Reels.
Focus area / search hint: ${category || "general viral trends"}.
For each item include exactly these keys: title, channel_name, estimated_views (string like '2.4M'), viral_score (integer 0-100), platform_tags (array of strings), youtube_search_url (YouTube search URL for the topic).
Return only valid JSON array, no markdown.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid Gemini response shape");
  }
  return parsed as ViralTopicRow[];
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
  const prompt = `You help create short-form video posts. Source: ${input.sourceUrl}, channel: ${input.sourceChannel}, clip ${input.startSec}s–${input.endSec}s.
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
The requested length per clip is approximately ${targetDuration} seconds. Keep the start and end timestamps strictly within what you find in the context. If timestamps aren't strictly numbered, estimate them logically.

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
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
  const prompt = `${system}\n\nConversation:\n${recent}\nuser: ${message}\nassistant:`;
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
