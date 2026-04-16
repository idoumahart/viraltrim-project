import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Play,
  Scissors,
  Search,
  TrendingUp,
  ExternalLink,
  Youtube,
  Globe2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type ViralVideo } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Platform config ──────────────────────────────────────────────────────────
const PLATFORMS = [
  { value: "all", label: "All Platforms", icon: "🌐" },
  { value: "youtube", label: "YouTube", icon: "▶️" },
  { value: "tiktok", label: "TikTok", icon: "🎵" },
  { value: "instagram", label: "Instagram", icon: "📸" },
  { value: "x", label: "X (Twitter)", icon: "🐦" },
  { value: "facebook", label: "Facebook", icon: "📘" },
  { value: "rumble", label: "Rumble", icon: "🔴" },
  { value: "dailymotion", label: "Dailymotion", icon: "📺" },
  { value: "vimeo", label: "Vimeo", icon: "🎬" },
  { value: "loom", label: "Loom", icon: "🎥" },
  { value: "reddit", label: "Reddit", icon: "🔶" },
] as const;

// Platform badge label helper
function platformLabel(platform?: string): string {
  return PLATFORMS.find((p) => p.value === platform)?.icon ?? "🌐";
}

// ─── Quick search presets ─────────────────────────────────────────────────────
const PRESETS = [
  { label: "🔥 Breaking news", query: "breaking news" },
  { label: "😂 Comedy skits", query: "comedy skits" },
  { label: "💻 Tech reviews", query: "tech reviews" },
  { label: "🎬 Movie clips", query: "official movie trailer scene" },
  { label: "🏆 Sports highlights", query: "sports highlights" },
  { label: "💪 Fitness tips", query: "fitness tips workout" },
];

const FUNNY_COMMENTS = [
  "Reticulating splines...",
  "Warming up the AI Hamsters...",
  "Searching the depths of the algorithm...",
  "Bribing the YouTube gods...",
  "Analyzing 10,000 cat videos...",
  "Checking TikTok for new dances...",
  "Downloading more RAM...",
];

function QuirkyLoader() {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIdx((i) => (i + 1) % FUNNY_COMMENTS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 col-span-full">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <div className="absolute animate-ping h-8 w-8 rounded-full bg-primary/20"></div>
      </div>
      <p className="text-sm text-muted-foreground animate-pulse font-medium">
        {FUNNY_COMMENTS[msgIdx]}
      </p>
    </div>
  );
}

export default function DiscoveryPage() {
  const navigate = useNavigate();
  const [trends, setTrends] = useState<ViralVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e?: React.FormEvent, directQuery?: string) => {
    if (e) e.preventDefault();
    const query = directQuery ?? searchQuery;
    if (!query.trim()) {
      toast.error("Enter a topic to search");
      return;
    }
    if (directQuery) setSearchQuery(directQuery);
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await api.getViralDiscovery(query, platform);
      if (res.success && res.data) {
        const fixedTrends = res.data.map(v => {
          // Only generate YouTube thumbnail fallback for YouTube URLs
          const ytId = v.url.match(/[?&]v=([^&]+)/)?.[1];
          const thumb = v.thumbnail || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : "");
          return { ...v, thumbnail: thumb };
        });
        setTrends(fixedTrends);
        if (res.data.length === 0) {
          toast.info("No results found. Try broader keywords or a different platform.");
        }
      } else {
        toast.error(res.error ?? "Search failed");
      }
    } catch {
      toast.error("Search failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout container contentClassName="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Globe2 className="h-3.5 w-3.5" />
          Built by codedmotion.studio
        </div>
        <h1 className="text-3xl font-display font-bold">Viral Search</h1>
        <p className="text-muted-foreground text-sm">
          Find trending videos across platforms — open any result in the Studio to generate clips.
        </p>
      </div>

      {/* Search bar + platform dropdown */}
      <form
        onSubmit={(e) => void handleSearch(e)}
        className="flex flex-col sm:flex-row gap-2 max-w-3xl"
      >
        {/* Platform selector */}
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-full sm:w-52 shrink-0">
            <SelectValue placeholder="All Platforms" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORMS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                <span className="flex items-center gap-2">
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Query input */}
        <div className="flex flex-1 gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Search e.g. "AI news", "street interviews"…'
            className="flex-1"
          />
          <Button type="submit" disabled={loading} className="btn-gradient gap-2 shrink-0">
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>
      </form>

      {/* Preset chips */}
      {!hasSearched && !loading && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.query}
              variant="outline"
              size="sm"
              className="text-xs h-8 gap-1.5"
              onClick={() => void handleSearch(undefined, p.query)}
            >
              <TrendingUp className="h-3 w-3 text-primary" />
              {p.label}
            </Button>
          ))}
        </div>
      )}

      {/* Results grid */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <QuirkyLoader />
        ) : (
          trends.map((t) => (
              <Card
                key={t.id}
                className="overflow-hidden border-border/80 bg-card/80 hover:border-primary/40 transition-all group"
              >
                {/* Thumbnail */}
                <div className="relative h-36 bg-muted/30 overflow-hidden">
                  {t.thumbnail ? (
                    <img
                      src={t.thumbnail}
                      alt={t.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Try hqdefault if maxresdefault fails
                        const img = e.currentTarget;
                        const ytId = t.url.match(/[?&]v=([^&]+)/)?.[1];
                        if (ytId && img.src.includes("maxresdefault")) {
                          img.src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
                        } else {
                          img.style.display = "none";
                        }
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground/30">
                      <Play className="h-8 w-8" />
                    </div>
                  )}
                  {/* CC badge */}
                  {(t as any).isCreativeCommons && (
                    <div className="absolute top-2 left-2 bg-green-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                      CC
                    </div>
                  )}
                  {/* Platform badge */}
                  <div className="absolute top-2 right-2 text-base leading-none">
                    {platformLabel((t as any).platform)}
                  </div>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                <CardHeader className="pb-2">
                  <CardTitle className="text-sm line-clamp-2 leading-snug">{t.title}</CardTitle>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {t.views && (
                      <Badge variant="secondary" className="text-xs">
                        {t.views} views
                      </Badge>
                    )}
                    {t.viralScore > 0 && (
                      <Badge
                        className={cn(
                          "text-xs",
                          t.viralScore >= 80
                            ? "bg-green-500/20 text-green-400 border-green-500/30"
                            : "bg-primary/20 text-primary border-primary/30",
                        )}
                        variant="outline"
                      >
                        {t.viralScore} score
                      </Badge>
                    )}
                    {t.duration && (
                      <Badge variant="outline" className="text-xs">
                        {t.duration}
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                {(t as any).engagement && (
                  <CardContent className="py-0 text-xs text-muted-foreground">
                    {(t as any).engagement}
                  </CardContent>
                )}

                <CardFooter className="flex gap-2 pt-3">
                  <Button size="sm" variant="outline" className="gap-1 text-xs flex-1" asChild>
                    <a href={t.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    className="btn-gradient gap-1 text-xs flex-1"
                    onClick={() =>
                      navigate("/studio/editor", { state: { video: t } })
                    }
                  >
                    <Scissors className="h-3 w-3" />
                    Studio
                  </Button>
                </CardFooter>
              </Card>
            ))
        )}
      </div>

      {/* Empty state after search */}
      {hasSearched && !loading && trends.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <Youtube className="h-10 w-10 opacity-20" />
          <p className="text-sm">No results found. Try different keywords or switch platforms.</p>
        </div>
      )}
    </AppLayout>
  );
}
