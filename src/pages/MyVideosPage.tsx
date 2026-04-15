import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Plus, Trash2, Video, FileText, Sparkles, Loader2, Play } from "lucide-react";
import { api } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Provide some funny loading states
const LOADING_MESSAGES = [
  "Teaching AI to watch TikToks...",
  "Convincing the algorithm you're funny...",
  "Watching 10,000 hours of YouTube so you don't have to...",
  "Extracting pure viral dopamine...",
];

export default function MyVideosPage() {
  const [url, setUrl] = useState("");
  const [activeVideo, setActiveVideo] = useState<any>(null);
  
  // Phase 2 hook flow state
  const [targetLength, setTargetLength] = useState<number>(30); // 30, 60, 90
  const [suggestedHooks, setSuggestedHooks] = useState<any[]>([]);

  const queryClient = useQueryClient();

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
        if (activeVideo) setActiveVideo(null);
      } else {
        toast.error("Failed to remove video");
      }
    },
  });

  const suggestHooksMutation = useMutation({
    mutationFn: () => api.suggestHooks({
      transcript: activeVideo?.transcript || "",
      targetLength: targetLength,
    }),
    onSuccess: (data) => {
      if (data.success && data.data) {
        setSuggestedHooks(data.data);
        toast.success("Got viral suggestions!");
      } else {
        toast.error(data.error || "Failed to load suggestions.");
      }
    },
    onError: () => toast.error("Network error while finding viral moments."),
  });

  const createClipMutation = useMutation({
    mutationFn: (hook: any) => api.generateClip({
      source_url: activeVideo?.url || "",
      source_channel: activeVideo?.title || "Imported Video",
      requested_start_seconds: hook.startSec,
      requested_end_seconds: hook.endSec,
    }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Clip rendered and saved to your studio!");
      } else {
        toast.error(data.error || "Failed to finalize clip.");
      }
    },
  });

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    importMutation.mutate(url);
  };

  const getFunnyLoadingMessage = () => {
    const idx = Math.floor(Math.random() * LOADING_MESSAGES.length);
    return LOADING_MESSAGES[idx];
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">My Videos</h1>
          <p className="text-muted-foreground mt-2">
            Import videos from YouTube to generate viral clips.
          </p>
        </div>

        <div className="p-6 rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm">
          <form onSubmit={handleImport} className="flex gap-4">
            <div className="flex-1 relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Video className="w-5 h-5" />
              </div>
              <Input
                placeholder="Paste YouTube link here..."
                className="pl-10 h-12 bg-background border-border"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-12 px-8 shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] transition-all"
              disabled={importMutation.isPending || !url}
            >
              {importMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <Plus className="w-5 h-5 mr-2" />}
              {importMutation.isPending ? "Importing..." : "Import Video"}
            </Button>
          </form>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Video Library</h2>
          {isLoading ? (
             <div className="flex flex-col items-center justify-center p-20 border border-dashed border-border rounded-xl">
               <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
               <p className="text-muted-foreground animate-pulse">{getFunnyLoadingMessage()}</p>
             </div>
          ) : links.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-xl">
              <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium">No videos imported yet</h3>
              <p className="text-muted-foreground">Paste a link above to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="group relative rounded-xl border border-border/50 bg-card overflow-hidden hover:border-primary/50 hover:shadow-[0_0_30px_rgba(var(--primary),0.1)] transition-all cursor-pointer"
                  onClick={() => {
                    setActiveVideo(link);
                    setSuggestedHooks([]); // reset hooks when changing videos
                  }}
                >
                  <div className="aspect-video bg-muted/30 relative flex items-center justify-center">
                    {link.platform === "youtube" ? (
                      <img src={`https://img.youtube.com/vi/${link.url.split('v=')[1]?.split('&')[0] || link.url.split('/').pop()}/maxresdefault.jpg`} alt="thumbnail" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = `https://img.youtube.com/vi/${link.url.split('v=')[1]?.split('&')[0] || link.url.split('/').pop()}/hqdefault.jpg`; }} />
                    ) : (
                      <Video className="w-10 h-10 text-muted-foreground opacity-50" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                      <Button variant="secondary" size="sm" className="rounded-full">
                        <Play className="w-4 h-4 mr-2" />
                        Extract Clips
                      </Button>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate" title={link.title || link.url}>
                          {link.title || link.url}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1 capitalize whitespace-nowrap overflow-hidden text-ellipsis">
                          {link.platform} • {new Date(link.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(link.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* INLINE VIDEO DETAILS EXPANSE (MODAL) */}
        <Dialog open={!!activeVideo} onOpenChange={(open) => !open && setActiveVideo(null)}>
          <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] overflow-hidden flex flex-col p-6 border-border bg-card shadow-2xl">
            {activeVideo && (
              <div className="flex-1 flex flex-col overflow-hidden h-full">
                <DialogHeader className="mb-4 shrink-0">
                  <DialogTitle className="text-xl flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary"/> AI Clip Extraction Studio</DialogTitle>
                  <DialogDescription className="truncate mt-1">{activeVideo.title}</DialogDescription>
                </DialogHeader>
                
                <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
                  
                  {/* Left Column: Player & Transcript */}
                  <div className="flex-1 flex flex-col gap-4 overflow-hidden min-w-[300px]">
                    <div className="aspect-video bg-black rounded-xl overflow-hidden shrink-0 border border-border/50">
                       {activeVideo.platform === "youtube" ? (
                          <iframe 
                            src={`https://www.youtube.com/embed/${activeVideo.url.split('v=')[1]?.split('&')[0] || activeVideo.url.split('/').pop()}`}
                            className="w-full h-full border-0"
                            allowFullScreen
                          />
                       ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Video className="w-8 h-8 opacity-40"/></div>
                       )}
                    </div>
                    
                    <div className="flex-1 flex flex-col min-h-[150px] border border-border/50 rounded-xl bg-muted/10">
                      <div className="px-4 py-3 border-b border-border/50 flex items-center bg-muted/20">
                        <FileText className="w-4 h-4 mr-2 text-primary"/>
                        <h3 className="font-semibold text-sm">Video Transcript</h3>
                      </div>
                      <ScrollArea className="flex-1 p-4">
                        {activeVideo.transcript ? (
                          <p className="font-mono text-xs leading-relaxed text-muted-foreground">{activeVideo.transcript}</p>
                        ) : (
                          <p className="text-muted-foreground text-sm flex items-center justify-center h-full opacity-60">No transcript available for this video.</p>
                        )}
                      </ScrollArea>
                    </div>
                  </div>

                  {/* Right Column: Hooks AI Generation */}
                  <div className="w-full md:w-[400px] flex flex-col gap-4 overflow-hidden shrink-0">
                    <Card className="shrink-0 border-border/50 bg-muted/10 shadow-none">
                      <CardContent className="p-4 space-y-4">
                        <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Find Viral Moments</h3>
                        
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">Target Clip Length</p>
                          <div className="flex gap-2">
                            <Button 
                              variant={targetLength === 30 ? "default" : "outline"} 
                              size="sm" 
                              className="flex-1"
                              onClick={() => setTargetLength(30)}
                            >Short (&lt;30s)</Button>
                            <Button 
                              variant={targetLength === 60 ? "default" : "outline"} 
                              size="sm" 
                              className="flex-1"
                              onClick={() => setTargetLength(60)}
                            >Med (30-60s)</Button>
                            <Button 
                              variant={targetLength === 90 ? "default" : "outline"} 
                              size="sm" 
                              className="flex-1"
                              onClick={() => setTargetLength(90)}
                            >Long (60s+)</Button>
                          </div>
                        </div>

                        <Button 
                          className="w-full shadow-[0_0_15px_rgba(var(--primary),0.5)]" 
                          disabled={!activeVideo.transcript || suggestHooksMutation.isPending}
                          onClick={() => suggestHooksMutation.mutate()}
                        >
                          {suggestHooksMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Sparkles className="w-4 h-4 mr-2"/>}
                          {suggestHooksMutation.isPending ? "Analyzing Transcript..." : "Generate AI Hooks"}
                        </Button>
                      </CardContent>
                    </Card>

                    <ScrollArea className="flex-1">
                      <div className="space-y-3 pb-4">
                        {suggestHooksMutation.isPending && (
                          <div className="p-6 rounded-lg border border-primary/20 bg-primary/5 flex flex-col items-center justify-center text-center space-y-3">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-sm font-medium animate-pulse text-primary">{getFunnyLoadingMessage()}</p>
                          </div>
                        )}

                        {!suggestHooksMutation.isPending && suggestedHooks.length === 0 && (
                          <div className="p-8 text-center text-sm text-muted-foreground border border-dashed border-border/50 rounded-lg">
                            Select a target length and click generate to find the most viral segments inside the transcript.
                          </div>
                        )}

                        {!suggestHooksMutation.isPending && suggestedHooks.map((hook, i) => (
                           <div key={i} className="p-4 border border-border/60 bg-card rounded-lg space-y-3 hover:border-primary/40 transition-colors shadow-sm">
                             <div className="flex items-start justify-between">
                               <h4 className="font-bold text-sm text-foreground pr-2 leading-tight">{hook.concept}</h4>
                               <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded font-mono font-bold shrink-0">{hook.viral_score}/100</span>
                             </div>
                             <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{hook.caption}</p>
                             <div className="flex items-center justify-between pt-2">
                               <span className="text-xs font-mono text-muted-foreground px-2 py-1 bg-muted rounded">
                                 {hook.startSec}s - {hook.endSec}s
                               </span>
                               <Button 
                                  size="sm" 
                                  onClick={() => createClipMutation.mutate(hook)}
                                  disabled={createClipMutation.isPending}
                                  variant="secondary"
                               >
                                 {createClipMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin"/> : "Save Clip"}
                               </Button>
                             </div>
                           </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </AppLayout>
  );
}
