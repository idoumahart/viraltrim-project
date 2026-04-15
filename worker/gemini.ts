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
