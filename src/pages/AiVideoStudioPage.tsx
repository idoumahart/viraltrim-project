import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Wand2,
  Mic,
  Film,
  Video,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Play,
  Pause,
  Download,
  Loader2,
  RefreshCw,
  Check,
  Volume2,
  Image,
  Clock,
  Type,
  MonitorPlay,
  Cloud,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { GradientText } from "@/components/cinematic/GradientText";
import { CinematicCard } from "@/components/cinematic/CinematicCard";
import { FloatingOrbs } from "@/components/cinematic/FloatingOrbs";
import { useAiVideoRender, shouldUseServerFallback } from "@/hooks/use-ai-video-render";
import { AppLayout } from "@/components/layout/AppLayout";

type Step = "script" | "voice" | "footage" | "preview" | "render";

interface ScriptSegment {
  text: string;
  duration: number;
}

interface VoiceOption {
  id: string;
  name: string;
  preview_url?: string;
  accent?: string;
  gender?: string;
}

interface StockClip {
  id: string;
  url: string;
  thumbnail: string;
  duration: number;
  width: number;
  height: number;
}

const STEPS: { id: Step; label: string; icon: React.ElementType }[] = [
  { id: "script", label: "Script", icon: Type },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "footage", label: "Footage", icon: Film },
  { id: "preview", label: "Preview", icon: Video },
  { id: "render", label: "Export", icon: Download },
];

const DEFAULT_VOICES: VoiceOption[] = [];

function VoicePreviewButton({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlaying(false);
      audioRef.current.onerror = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  };

  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
    >
      {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      {playing ? "Stop" : "Preview"}
    </button>
  );
}

export function AiVideoStudioPage() {
  const [step, setStep] = useState<Step>("script");
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [scriptSegments, setScriptSegments] = useState<ScriptSegment[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [voices, setVoices] = useState<VoiceOption[]>(DEFAULT_VOICES);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [creativeMode, setCreativeMode] = useState(false);
  const [useAiFootage, setUseAiFootage] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [pexelsKeywords, setPexelsKeywords] = useState<Array<{ segmentIndex: number; keywords: string }>>([]);

  // Fetch real voices from ElevenLabs API on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoadingVoices(true);
    fetch("/api/ai-video/voices")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && Array.isArray(data.voices) && data.voices.length > 0) {
          const mapped: VoiceOption[] = data.voices.map((v: any) => ({
            id: v.voice_id,
            name: v.name,
            preview_url: v.preview_url,
            accent: v.labels?.accent || "",
            gender: v.labels?.gender || "",
          }));
          setVoices(mapped);
          setSelectedVoice(mapped[0].id);
        }
      })
      .catch((e) => console.error("Failed to load voices:", e))
      .finally(() => {
        if (!cancelled) setIsLoadingVoices(false);
      });
    return () => { cancelled = true; };
  }, []);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stockClips, setStockClips] = useState<StockClip[]>([]);
  const [selectedClips, setSelectedClips] = useState<StockClip[]>([]);
  const [isSearchingClips, setIsSearchingClips] = useState(false);
  const [renderStatus, setRenderStatus] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [renderProgress, setRenderProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<"cloud" | "browser">("cloud");
  const audioRef = useRef<HTMLAudioElement>(null);

  const browserRender = useAiVideoRender();

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const generateScript = useCallback(async () => {
    if (!topic.trim()) return;
    setIsGeneratingScript(true);
    try {
      const res = await fetch("/api/ai-video/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, tone: "viral", duration: 30, creativeMode }),
      });
      const data = await res.json();
      if (data.success && data.script) {
        setScript(data.script);
        setScriptSegments(data.segments || parseScriptToSegments(data.script));
      }
    } catch (e) {
      console.error("Script generation failed", e);
    } finally {
      setIsGeneratingScript(false);
    }
  }, [topic, creativeMode]);

  const generateVoice = useCallback(async () => {
    if (!script.trim() || !selectedVoice) return;
    setIsGeneratingVoice(true);
    try {
      const res = await fetch("/api/ai-video/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voiceId: selectedVoice }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `Voice generation failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (e: any) {
      const msg = e?.message || "Voice generation failed";
      console.error("Voice generation failed:", msg);
      alert(msg);
    } finally {
      setIsGeneratingVoice(false);
    }
  }, [script, selectedVoice]);

  const searchClips = useCallback(async (forceMode?: "ai" | "stock") => {
    const mode = forceMode ?? (useAiFootage ? "ai" : "stock");

    if (mode === "ai") {
      setIsGeneratingVideos(true);
      try {
        const res = await fetch("/api/ai-video/generate-videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segments: scriptSegments }),
        });
        const data = await res.json();
        if (data.success && data.videos) {
          const videoClips: StockClip[] = data.videos.map((v: any) => ({
            id: `ai-${v.segmentIndex}`,
            url: v.videoUrl,
            thumbnail: v.videoUrl,
            duration: scriptSegments[v.segmentIndex]?.duration || 5,
            width: v.width || 720,
            height: v.height || 1280,
          }));
          setStockClips(videoClips);
          setSelectedClips(videoClips);
        } else {
          console.error("Video generation failed:", data.error);
        }
      } catch (e) {
        console.error("Video generation failed", e);
      } finally {
        setIsGeneratingVideos(false);
      }
      return;
    }

    setIsSearchingClips(true);
    try {
      const kwRes = await fetch("/api/ai-video/pexels-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, segments: scriptSegments }),
      });
      const kwData = await kwRes.json();
      const keywords = kwData.success && kwData.keywords ? kwData.keywords : [];
      setPexelsKeywords(keywords);

      const bestKeyword = keywords.find((k: any) => k.keywords)?.keywords || "";
      const query = bestKeyword || topic.split(" ").slice(0, 3).concat(script.split(" ").slice(0, 5)).join(" ");

      const res = await fetch(`/api/ai-video/pexels?q=${encodeURIComponent(query)}&per_page=12`);
      const data = await res.json();
      if (data.clips) {
        setStockClips(data.clips);
        setSelectedClips(data.clips.slice(0, Math.min(4, data.clips.length)));
      }
    } catch (e) {
      console.error("Clip search failed", e);
    } finally {
      setIsSearchingClips(false);
    }
  }, [topic, script, scriptSegments, useAiFootage]);

  const pollRender = useCallback((jobId: string) => {
    let attempts = 0;
    const maxAttempts = 120; // ~6 minutes
    const interval = setInterval(async () => {
      attempts++;
      setRenderProgress(Math.min((attempts / maxAttempts) * 100, 95));
      try {
        const res = await fetch(`/api/ai-video/render/${jobId}`);
        const data = await res.json();
        if (data.status === "done" && data.url) {
          clearInterval(interval);
          setRenderProgress(100);
          setRenderStatus("done");
          setOutputUrl(data.url);
          setRenderError(null);
        } else if (data.status === "error") {
          clearInterval(interval);
          setRenderStatus("error");
          setRenderError(data.error || "Cloud rendering failed");
        }
      } catch {
        /* ignore poll errors */
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setRenderStatus("error");
        setRenderError("Render timed out after 6 minutes");
      }
    }, 3000);
  }, []);

  const startRender = useCallback(async () => {
    setRenderStatus("rendering");
    setRenderProgress(0);

    if (!audioUrl) {
      setRenderStatus("error");
      return;
    }

    // Browser path: only if explicitly chosen AND device can handle it
    if (renderMode === "browser" && !shouldUseServerFallback()) {
      try {
        const url = await browserRender.render({
          clips: selectedClips.map((c, i) => ({
            // Proxy through worker to avoid CORS on Pexels/fal.ai
            url: `/api/proxy-media?url=${encodeURIComponent(c.url)}`,
            duration: scriptSegments[i]?.duration || c.duration || 5,
          })),
          audioUrl,
          script,
        });
        if (url) {
          setOutputUrl(url);
          setRenderStatus("done");
          setRenderError(null);
        } else {
          setRenderStatus("error");
          setRenderError(browserRender.error || "Browser rendering failed");
        }
      } catch (e: any) {
        setRenderStatus("error");
        setRenderError(e?.message || "Browser rendering failed");
      }
      return;
    }

    // Cloud Run path (default + fallback for low-end devices)
    try {
      setRenderError(null);
      // Upload audio blob so Cloud Run renderer can download it
      const audioBlob = await fetch(audioUrl).then((r) => r.blob());
      const audioFile = new File([audioBlob], "voiceover.mp3", { type: "audio/mpeg" });
      const uploadRes = await fetch("/api/media/upload", {
        method: "POST",
        body: (() => { const f = new FormData(); f.append("file", audioFile); return f; })(),
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success || !uploadData.url) {
        const msg = uploadData.error || "Audio upload failed";
        console.error("Audio upload failed:", msg);
        setRenderStatus("error");
        setRenderError(msg);
        return;
      }

      const res = await fetch("/api/ai-video/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          voiceId: selectedVoice,
          clips: selectedClips.map((c) => c.url),
          segments: scriptSegments,
          audioUrl: uploadData.url,
        }),
      });
      const data = await res.json();
      if (data.jobId) {
        pollRender(data.jobId);
      } else {
        const msg = data.error || "Render request failed";
        setRenderStatus("error");
        setRenderError(msg);
      }
    } catch (e: any) {
      const msg = e?.message || "Cloud render failed";
      console.error("Cloud render failed:", msg);
      setRenderStatus("error");
      setRenderError(msg);
    }
  }, [script, selectedVoice, selectedClips, scriptSegments, audioUrl, renderMode, browserRender, pollRender]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const canProceed = () => {
    switch (step) {
      case "script": return script.trim().length > 0;
      case "voice": return !!audioUrl;
      case "footage": return selectedClips.length > 0;
      case "preview": return true;
      case "render": return renderStatus === "done";
      default: return false;
    }
  };

  const goNext = () => {
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1].id);
      // Don't auto-search footage — let user explicitly choose AI or Stock
    }
  };

  const goBack = () => {
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx > 0) setStep(STEPS[idx - 1].id);
  };

  return (
    <AppLayout container contentClassName="relative">
      <FloatingOrbs />

      {/* Page Header + Stepper */}
      <div className="relative z-10 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg">AI Video Studio</h1>
            <p className="text-xs text-muted-foreground">Text-to-Video powered by AI</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {STEPS.map((s, i) => {
            const isActive = s.id === step;
            const isCompleted = i < stepIndex;
            return (
              <React.Fragment key={s.id}>
                <button
                  onClick={() => {
                    if (isCompleted || i <= stepIndex + 1) setStep(s.id);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                    isActive && "bg-primary/15 text-primary",
                    isCompleted && "text-emerald-400",
                    !isActive && !isCompleted && "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <s.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{s.label}</span>
                  {isCompleted && <Check className="h-3.5 w-3.5" />}
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Script Step */}
        {step === "script" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-display text-3xl font-bold">
                What&apos;s your video <GradientText>about?</GradientText>
              </h2>
              <p className="text-muted-foreground">Describe your idea and AI will write a viral script.</p>
            </div>

            <CinematicCard className="max-w-2xl mx-auto">
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Topic or idea</label>
                  <Input
                    placeholder="e.g. 5 productivity hacks for entrepreneurs"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="bg-white/[0.04] border-white/[0.08]"
                  />
                </div>
                <Button
                  onClick={generateScript}
                  disabled={!topic.trim() || isGeneratingScript}
                  className="w-full gap-2"
                >
                  {isGeneratingScript ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Writing script...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4" />
                      Generate Script
                    </>
                  )}
                </Button>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="creative-mode"
                    checked={creativeMode}
                    onChange={(e) => setCreativeMode(e.target.checked)}
                    className="rounded border-white/[0.08] bg-white/[0.04] text-primary focus:ring-primary"
                  />
                  <label htmlFor="creative-mode" className="text-xs text-muted-foreground cursor-pointer select-none">
                    Creative/Fictional mode (disables fact-checking research)
                  </label>
                </div>
              </div>
            </CinematicCard>

            {script && (
              <CinematicCard className="max-w-2xl mx-auto" glowColor="#8b5cf6">
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Generated Script</label>
                    <Button variant="ghost" size="sm" onClick={generateScript} disabled={isGeneratingScript}>
                      <RefreshCw className={cn("h-4 w-4", isGeneratingScript && "animate-spin")} />
                    </Button>
                  </div>
                  <Textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    rows={8}
                    className="bg-white/[0.04] border-white/[0.08] resize-none font-mono text-sm leading-relaxed"
                  />
                  <p className="text-xs text-muted-foreground">
                    {script.split(" ").length} words · Estimated {Math.ceil(script.split(" ").length / 2.5)}s
                  </p>
                </div>
              </CinematicCard>
            )}
          </div>
        )}

        {/* Voice Step */}
        {step === "voice" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-display text-3xl font-bold">
                Choose a <GradientText>voice</GradientText>
              </h2>
              <p className="text-muted-foreground">Pick an AI voice that matches your content.</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {isLoadingVoices ? (
                <div className="col-span-full flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                voices.map((voice) => (
                <div
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={cn(
                    "relative p-4 rounded-xl border text-left transition-all hover:border-primary/40 cursor-pointer",
                    selectedVoice === voice.id
                      ? "border-primary bg-primary/10"
                      : "border-white/[0.08] bg-white/[0.03]"
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                      <Mic className="h-5 w-5 text-primary" />
                    </div>
                    {selectedVoice === voice.id && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                  <p className="font-medium text-sm">{voice.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {voice.accent} · {voice.gender}
                  </p>
                  {voice.preview_url && (
                    <div onClick={(e) => e.stopPropagation()} className="mt-3">
                      <VoicePreviewButton url={voice.preview_url} />
                    </div>
                  )}
                </div>
              ))
              )}
            </div>

            <div className="flex justify-center">
              <Button
                onClick={generateVoice}
                disabled={!script.trim() || isGeneratingVoice}
                size="lg"
                className="gap-2"
              >
                {isGeneratingVoice ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating voice...
                  </>
                ) : (
                  <>
                    <Volume2 className="h-4 w-4" />
                    Generate Voiceover
                  </>
                )}
              </Button>
            </div>

            {audioUrl && (
              <CinematicCard className="max-w-md mx-auto" glowColor="#06b6d4">
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={togglePlay}
                      className="w-12 h-12 rounded-full bg-primary flex items-center justify-center hover:scale-105 transition-transform"
                    >
                      {isPlaying ? (
                        <Pause className="h-5 w-5 text-white" />
                      ) : (
                        <Play className="h-5 w-5 text-white ml-0.5" />
                      )}
                    </button>
                    <div>
                      <p className="font-medium text-sm">Voiceover Preview</p>
                      <p className="text-xs text-muted-foreground">{selectedVoice}</p>
                    </div>
                  </div>
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    onEnded={() => setIsPlaying(false)}
                    className="w-full"
                    controls
                  />
                </div>
              </CinematicCard>
            )}
          </div>
        )}

        {/* Footage Step */}
        {step === "footage" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-display text-3xl font-bold">
                Match <GradientText>footage</GradientText>
              </h2>
              <p className="text-muted-foreground">
                Choose how you want to source visuals for your video.
              </p>
            </div>

            {/* Choice cards — shown when no clips loaded and not searching */}
            {stockClips.length === 0 && !isSearchingClips && !isGeneratingVideos && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                <button
                  onClick={() => { setUseAiFootage(false); searchClips("stock"); }}
                  className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-left transition-all hover:bg-white/[0.06] hover:border-primary/30"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-4">
                    <Film className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">Stock Footage</h3>
                  <p className="text-sm text-muted-foreground">
                    Search Pexels for free stock videos that match your script segments.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-sm text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>Search Pexels</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </button>

                <button
                  onClick={() => { setUseAiFootage(true); searchClips("ai"); }}
                  className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-left transition-all hover:bg-white/[0.06] hover:border-primary/30"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4">
                    <Sparkles className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">AI-Generated Scenes</h3>
                  <p className="text-sm text-muted-foreground">
                    Generate unique motion scenes with fal.ai Wan 2.6 for each script segment.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-sm text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>Generate with AI</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </button>
              </div>
            )}

            {/* Toggle + results — shown after clips are loaded or during search */}
            {(stockClips.length > 0 || isSearchingClips || isGeneratingVideos) && (
              <>
                <div className="flex justify-center">
                  <div className="inline-flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
                    <button
                      onClick={() => { setUseAiFootage(false); setStockClips([]); setSelectedClips([]); searchClips("stock"); }}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        !useAiFootage
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Stock Footage (Pexels)
                    </button>
                    <button
                      onClick={() => { setUseAiFootage(true); setStockClips([]); setSelectedClips([]); searchClips("ai"); }}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        useAiFootage
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      AI-Generated Scenes
                    </button>
                  </div>
                </div>

                {isSearchingClips || isGeneratingVideos ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">
                      {useAiFootage ? "Generating AI scenes with fal.ai (this may take 1-2 minutes)..." : "Searching Pexels for matching clips..."}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {stockClips.map((clip) => {
                        const isSelected = selectedClips.some((c) => c.id === clip.id);
                        return (
                          <button
                            key={clip.id}
                            onClick={() => {
                              setSelectedClips((prev) =>
                                isSelected
                                  ? prev.filter((c) => c.id !== clip.id)
                                  : [...prev, clip]
                              );
                            }}
                            className={cn(
                              "relative aspect-video rounded-xl overflow-hidden border-2 transition-all",
                              isSelected ? "border-primary" : "border-transparent hover:border-white/20"
                            )}
                          >
                            {clip.id.startsWith("ai-") ? (
                              <video
                                src={clip.url}
                                muted
                                autoPlay
                                loop
                                playsInline
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src={clip.thumbnail}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            )}
                            {isSelected && (
                              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                                <Check className="h-3.5 w-3.5 text-white" />
                              </div>
                            )}
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                              <p className="text-xs text-white/80 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {clip.duration}s
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-center text-sm text-muted-foreground">
                      {selectedClips.length} clip{selectedClips.length !== 1 ? "s" : ""} selected
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Preview Step */}
        {step === "preview" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-display text-3xl font-bold">
                <GradientText>Preview</GradientText> your video
              </h2>
              <p className="text-muted-foreground">Review before rendering the final version.</p>
            </div>

            <CinematicCard className="max-w-2xl mx-auto" glowColor="#ec4899">
              <div className="p-6 space-y-6">
                {/* Video preview area */}
                <div className="aspect-video rounded-xl bg-black/40 flex items-center justify-center relative overflow-hidden">
                  {selectedClips.length > 0 ? (
                    selectedClips[0].id.startsWith("ai-") ? (
                      <video
                        src={selectedClips[0].url}
                        muted
                        autoPlay
                        loop
                        playsInline
                        className="w-full h-full object-cover opacity-60"
                      />
                    ) : (
                      <img
                        src={selectedClips[0].thumbnail}
                        alt="Preview"
                        className="w-full h-full object-cover opacity-60"
                      />
                    )
                  ) : (
                    <Video className="h-16 w-16 text-muted-foreground/30" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center hover:scale-105 transition-transform">
                      <Play className="h-7 w-7 text-white ml-1" />
                    </button>
                  </div>
                </div>

                {/* Script timeline */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">Script</p>
                  <ScrollArea className="h-40 rounded-lg bg-white/[0.03] p-4">
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {script}
                    </p>
                  </ScrollArea>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 rounded-lg bg-white/[0.03]">
                    <p className="text-lg font-bold">{selectedClips.length}</p>
                    <p className="text-xs text-muted-foreground">Clips</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.03]">
                    <p className="text-lg font-bold">{selectedVoice}</p>
                    <p className="text-xs text-muted-foreground">Voice</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.03]">
                    <p className="text-lg font-bold">
                      {Math.ceil(script.split(" ").length / 2.5)}s
                    </p>
                    <p className="text-xs text-muted-foreground">Duration</p>
                  </div>
                </div>
              </div>
            </CinematicCard>

            {/* Render mode selector */}
            <div className="flex justify-center">
              <div className="inline-flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
                <button
                  onClick={() => setRenderMode("cloud")}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    renderMode === "cloud"
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Cloud Render (Fast)
                </button>
                <button
                  onClick={() => setRenderMode("browser")}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    renderMode === "browser"
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Browser Render
                </button>
              </div>
            </div>

            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={startRender}
                disabled={renderStatus === "rendering" || browserRender.isRendering}
                className="gap-2"
              >
                {renderStatus === "rendering" || browserRender.isRendering ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Video className="h-4 w-4" />
                )}
                {renderStatus === "rendering" || browserRender.isRendering
                  ? "Rendering..."
                  : "Render Final Video"}
              </Button>
            </div>
          </div>
        )}

        {/* Render Step */}
        {step === "render" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-display text-3xl font-bold">
                <GradientText>Export</GradientText> your video
              </h2>
            </div>

            <CinematicCard className="max-w-md mx-auto">
              <div className="p-8 space-y-6 text-center">
                {renderStatus === "idle" && !browserRender.isRendering && (
                  <>
                    <Video className="h-16 w-16 text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground">Click &quot;Render Final Video&quot; on the Preview step to start.</p>
                  </>
                )}

                {(renderStatus === "rendering" || browserRender.isRendering) && (
                  <>
                    <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
                    <div className="space-y-2">
                      <p className="font-medium">
                        {browserRender.isRendering
                          ? browserRender.stageLabel
                          : "Rendering your video..."}
                      </p>
                      <div className="w-full h-2 bg-white/[0.08] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-500"
                          style={{
                            width: `${
                              browserRender.isRendering
                                ? browserRender.progress
                                : renderProgress
                            }%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {browserRender.isRendering
                          ? `${browserRender.progress}%`
                          : `${Math.round(renderProgress)}%`}
                      </p>
                    </div>
                  </>
                )}

                {renderStatus === "done" && outputUrl && (
                  <>
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                      <Check className="h-8 w-8 text-emerald-400" />
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium text-lg">Video ready!</p>
                      <p className="text-sm text-muted-foreground">Your AI-generated video is ready for download.</p>
                    </div>
                    <video
                      src={outputUrl}
                      controls
                      className="w-full rounded-xl"
                    />
                    <a
                      href={outputUrl}
                      download
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:scale-105 transition-transform"
                    >
                      <Download className="h-4 w-4" />
                      Download Video
                    </a>
                  </>
                )}

                {renderStatus === "error" && (
                  <>
                    <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto">
                      <AlertCircle className="h-8 w-8 text-destructive" />
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium">Rendering failed</p>
                      {renderError ? (
                        <div className="max-w-xs mx-auto">
                          <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 break-words">
                            {renderError}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Please try again or <a href="mailto:support@codedmotion.studio" className="underline">contact support</a>.</p>
                      )}
                    </div>
                    <Button onClick={startRender} variant="outline">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Try Again
                    </Button>
                  </>
                )}
              </div>
            </CinematicCard>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-12 max-w-2xl mx-auto">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={stepIndex === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={goNext}
            disabled={!canProceed() || stepIndex === STEPS.length - 1}
            className="gap-2"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

function parseScriptToSegments(script: string): ScriptSegment[] {
  const sentences = script.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  return sentences.map((text) => ({
    text: text.trim(),
    duration: Math.ceil(text.trim().split(" ").length / 2.5),
  }));
}
