import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Plus, Trash2, Video, Sparkles, Loader2, Play, X, ExternalLink } from "lucide-react";
import { api } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import ReactPlayer from "react-player";

// Derive YouTube thumbnail from URL if thumbnail is missing
function resolveThumbnail(link: any): string | null {
  if (link.thumbnail) return link.thumbnail;
  try {
    const ytId =
      link.url.match(/[?&]v=([^&]+)/)?.[1] ||
      link.url.match(/youtu\.be\/([^?&]+)/)?.[1];
    if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  } catch {}
  return null;
}

export default function MyVideosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null); // expanded card id

  const { data: res, isLoading } = useQuery({
    queryKey: ["importedLinks"],
    queryFn: () => api.getImportedLinks(),
  });

  const links = res?.data || [];

  const importMutation = useMutation({
    mutationFn: (importUrl: string) => api.importLink(importUrl),
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Video imported successfully!");
        setUrl("");
        queryClient.invalidateQueries({ queryKey: ["importedLinks"] });
      } else {
        toast.error(data.error || "Failed to import video");
      }
    },
    onError: () => toast.error("Failed to import video"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteImportedLink(id),
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Video removed");
        queryClient.invalidateQueries({ queryKey: ["importedLinks"] });
      } else {
        toast.error("Failed to remove video");
      }
    },
  });

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    // Frontend dedup guard: warn if URL already in the library
    const alreadyExists = links.some((l: any) => l.url === trimmed);
    if (alreadyExists) {
      toast.info("This video is already in your library.");
      setUrl("");
      return;
    }

    importMutation.mutate(trimmed);
  };

  const handleGenerateClips = (video: any) => {
    navigate(`/studio/generator/${video.id}`);
  };

  const togglePreview = (id: string) => {
    setPreviewId((prev) => (prev === id ? null : id));
  };

  return (
    <AppLayout container contentClassName="space-y-10 pb-20">
      {/* Header / Import Section */}
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-display font-bold">My Videos</h1>
          <p className="text-muted-foreground text-lg">
            Import videos from YouTube, TikTok, or any supported platform to generate viral clips.
          </p>
        </div>

        <form onSubmit={handleImport} className="flex flex-col sm:flex-row gap-3 max-w-3xl">
          <div className="relative flex-1">
            <Video className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste video link here (YouTube, TikTok, etc.)…"
              className="pl-11 h-12 bg-card border-white/10 focus:border-primary/50 transition-all text-base"
              disabled={importMutation.isPending}
            />
          </div>
          <Button
            type="submit"
            className="h-12 px-8 btn-gradient font-bold text-base shadow-lg shadow-primary/20"
            disabled={importMutation.isPending || !url.trim()}
          >
            {importMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Plus className="h-5 w-5 mr-2" />
            )}
            Import Link
          </Button>
        </form>

        {importMutation.isPending && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 max-w-3xl">
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            <span>Importing video and extracting transcript — this may take up to 2 minutes for long videos…</span>
          </div>
        )}
      </div>

      {/* Video Grid */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Imported Library
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-white/10 ml-2 opacity-70"
            )}>
              {links.length}
            </span>
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="bg-card border-white/5 h-64 animate-pulse" />
            ))}
          </div>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-3xl border-2 border-dashed border-white/10 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
              <Video className="h-8 w-8 text-white/20" />
            </div>
            <div>
              <h3 className="text-lg font-bold">No videos imported yet</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">Paste a link above to start your viral journey.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {links.map((link: any) => {
              const thumbnail = resolveThumbnail(link);
              const isExpanded = previewId === link.id;

              return (
                <Card
                  key={link.id}
                  className={cn(
                    "group overflow-hidden bg-card border-white/5 hover:border-primary/40 transition-all duration-300 shadow-xl",
                    isExpanded && "border-primary/40 col-span-1 md:col-span-2 lg:col-span-1"
                  )}
                >
                  {/* Thumbnail / Player */}
                  <div className="aspect-video relative bg-black">
                    {isExpanded ? (
                      <ReactPlayer
                        url={link.url}
                        controls
                        width="100%"
                        height="100%"
                        playing={true} // Auto-play when expanded
                        onError={() => {
                          console.warn("Player failed to load. The video URL might be protected or unsupported. Falling back to native source link.");
                          window.open(link.url, '_blank');
                          setPreviewId(null);
                        }}
                      />
                    ) : thumbnail ? (
                      <img
                        src={thumbnail}
                        alt={link.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/10">
                        <Video className="h-12 w-12" />
                      </div>
                    )}

                    {/* Play / Collapse overlay — only when not expanded */}
                    {!isExpanded && (
                      <div
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 backdrop-blur-[2px] cursor-pointer"
                        onClick={() => togglePreview(link.id)}
                      >
                        <div className="rounded-full h-12 w-12 bg-primary hover:scale-110 transition-transform flex items-center justify-center">
                          <Play className="h-6 w-6 ml-0.5 fill-current text-white" />
                        </div>
                      </div>
                    )}

                    {/* Collapse button when expanded */}
                    {isExpanded && (
                      <button
                        onClick={() => setPreviewId(null)}
                        className="absolute top-2 right-2 z-20 h-7 w-7 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                      >
                        <X className="h-4 w-4 text-white" />
                      </button>
                    )}

                    {link.duration && !isExpanded && (
                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono font-bold text-white z-20">
                        {link.duration}
                      </div>
                    )}
                  </div>

                  <CardContent className="p-4 space-y-4">
                    <div className="space-y-1">
                      <h3 className="font-bold text-sm line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                        {link.title || "Untitled Video"}
                      </h3>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                        {(() => { try { return new URL(link.url).hostname.replace("www.", ""); } catch { return "Unknown"; } })()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {/* Watch externally */}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0 border-white/10"
                        asChild
                      >
                        <a href={link.url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>

                      {/* Generate Viral Clips */}
                      <Button
                        className="flex-1 btn-gradient text-xs font-bold h-9"
                        onClick={() => handleGenerateClips(link)}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Generate Viral Clips
                      </Button>

                      {/* Delete */}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0 border-white/10 hover:bg-destructive/20 hover:text-destructive hover:border-destructive/30"
                        onClick={() => deleteMutation.mutate(link.id)}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature="Longer clips & bulk saving"
        reason="Creating clips longer than 90 seconds and bulk-saving operations are strictly reserved for Agency accounts."
        requiredPlan="agency"
      />
    </AppLayout>
  );
}
