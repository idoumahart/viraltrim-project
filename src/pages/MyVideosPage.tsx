import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Copy, Plus, Trash2, Video, FileText, Download, Scissors, Play } from "lucide-react";
import { api } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MyVideosPage() {
  const [url, setUrl] = useState("");
  const [activeVideo, setActiveVideo] = useState<any>(null);
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

  const generateHookMutation = useMutation({
    mutationFn: () => api.generateClip({
      source_url: activeVideo?.url || "",
      source_channel: activeVideo?.title || "Imported Video",
      requested_start_seconds: 0,
      requested_end_seconds: 60,
    }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Viral hook generated successfully!");
        // Force the tab state to switch to clips if needed, or simply let the user navigate
        document.querySelector<HTMLButtonElement>('[data-state="inactive"][value="clips"]')?.click();
      } else {
        toast.error(data.error || "Failed to generate hook");
      }
    },
    onError: () => toast.error("Failed to generate hook"),
  });

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    importMutation.mutate(url);
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">My Videos</h1>
          <p className="text-muted-foreground mt-2">
            Import videos from YouTube, TikTok, or Instagram to generate viral clips.
          </p>
        </div>

        <div className="p-6 rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm">
          <form onSubmit={handleImport} className="flex gap-4">
            <div className="flex-1 relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Video className="w-5 h-5" />
              </div>
              <Input
                placeholder="Paste YouTube, TikTok, or Instagram link here..."
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
              {importMutation.isPending ? "Importing..." : (
                <>
                  <Plus className="w-5 h-5 mr-2" />
                  Import Video
                </>
              )}
            </Button>
          </form>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Video Library</h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 rounded-xl bg-card border border-border/50" />
              ))}
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
                  onClick={() => setActiveVideo(link)}
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
                        Open Studio
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

        <Dialog open={!!activeVideo} onOpenChange={(open) => !open && setActiveVideo(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 border-border bg-card shadow-2xl">
            {activeVideo && (
              <>
                <div className="p-6 border-b border-border/50 shrink-0">
                  <DialogHeader>
                    <DialogTitle className="text-xl">{activeVideo.title || "Video Studio"}</DialogTitle>
                    <DialogDescription className="truncate mt-1">{activeVideo.url}</DialogDescription>
                  </DialogHeader>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                  <Tabs defaultValue="editor" className="flex-1 flex flex-col h-full">
                    <div className="px-6 border-b border-border/50 shrink-0">
                      <TabsList className="bg-transparent space-x-2">
                        <TabsTrigger value="editor" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/30">
                          <Scissors className="w-4 h-4 mr-2" />
                          Clip Editor
                        </TabsTrigger>
                        <TabsTrigger value="script" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/30">
                          <FileText className="w-4 h-4 mr-2" />
                          Video Script
                        </TabsTrigger>
                        <TabsTrigger value="clips" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/30">
                          <Video className="w-4 h-4 mr-2" />
                          Saved Clips
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-muted/10 p-6 min-h-[400px]">
                      <TabsContent value="editor" className="mt-0 h-full">
                        <div className="flex flex-col items-center justify-center h-full space-y-6 max-w-xl mx-auto">
                          <div className="w-full aspect-video bg-black rounded-lg border border-border/50 overflow-hidden flex items-center justify-center relative">
                             {activeVideo.platform === "youtube" ? (
                                <iframe 
                                  src={`https://www.youtube.com/embed/${activeVideo.url.split('v=')[1]?.split('&')[0] || activeVideo.url.split('/').pop()}`}
                                  className="w-full h-full border-0 absolute inset-0"
                                  allowFullScreen
                                />
                             ) : (
                                <p className="text-muted-foreground flex items-center"><Video className="w-5 h-5 mr-2 opacity-50"/> Player preview</p>
                             )}
                          </div>
                          <div className="w-full bg-card border border-border p-5 rounded-lg space-y-4">
                            <div>
                               <h4 className="font-medium mb-1">AI Viral Hooks</h4>
                               <p className="text-sm text-muted-foreground mb-4">Click below to let AI scan the video and suggest the best viral crop sections.</p>
                            </div>
                            <Button 
                              className="w-full" 
                              disabled={!activeVideo.transcript || generateHookMutation.isPending}
                              onClick={() => generateHookMutation.mutate()}
                            >
                              {generateHookMutation.isPending ? "Generating Hooks..." : "Generate Viral Hooks"}
                            </Button>
                            {!activeVideo.transcript && (
                              <p className="text-xs text-center text-muted-foreground mt-2">Cannot generate hooks without a transcript.</p>
                            )}
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="script" className="mt-0 h-full">
                        {activeVideo.transcript ? (
                          <div className="h-full flex flex-col space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="font-medium flex items-center">
                                <FileText className="w-4 h-4 mr-2 text-primary" />
                                Extracted Transcript
                              </h3>
                              <Button variant="outline" size="sm" onClick={() => {
                                navigator.clipboard.writeText(activeVideo.transcript);
                                toast.success("Transcript copied to clipboard");
                              }}>
                                <Copy className="w-4 h-4 mr-2" />
                                Copy text
                              </Button>
                            </div>
                            <div className="flex-1 bg-card border border-border/50 rounded-lg p-6 overflow-y-auto font-mono text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap select-text">
                              {activeVideo.transcript}
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border/50 rounded-lg bg-card/30 space-y-4">
                            <FileText className="w-12 h-12 opacity-20" />
                            <p>No script could be automatically extracted for this video.</p>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="clips" className="mt-0 h-full">
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border/50 rounded-lg bg-card/30 space-y-4">
                            <Download className="w-12 h-12 opacity-20" />
                            <p>You haven't generated any clips for this video yet.</p>
                            <Button variant="outline" size="sm" onClick={() => document.querySelector<HTMLButtonElement>('[data-state="inactive"][value="editor"]')?.click()}>
                              Go to Editor
                            </Button>
                        </div>
                      </TabsContent>
                    </div>
                  </Tabs>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
