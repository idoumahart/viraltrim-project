import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Plus, Trash2, Video, Sparkles, Loader2, Play, X, ExternalLink, FileText, AlertCircle, CheckCircle2, Pencil, Upload, Link as LinkIcon, Mic } from "lucide-react";
import { api } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useBrowserTranscribe } from "@/hooks/use-browser-transcribe";

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

/** Get embed URL for iframe playback — works for YouTube & TikTok */
function getEmbedUrl(url?: string): string {
  if (!url) return "";
  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`;
  }
  const ttMatch = url.match(/tiktok\.com\/(?:@[\w.-]+\/video\/|v\/|t\/|[\w.-]+\/)([\d]+)/i);
  if (ttMatch && ttMatch[1]) {
    return `https://www.tiktok.com/embed/v2/${ttMatch[1]}`;
  }
  return url;
}

export default function MyVideosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null); // expanded card id
  const [transcriptModalId, setTranscriptModalId] = useState<string | null>(null);
  const [manualTranscript, setManualTranscript] = useState("");
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const browserTranscribe = useBrowserTranscribe();

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

  const transcriptMutation = useMutation({
    mutationFn: ({ id, transcript }: { id: string; transcript: string }) =>
      api.updateTranscript(id, transcript),
    onSuccess: (data, vars) => {
      if (data.success) {
        toast.success("Transcript saved!");
        setTranscriptModalId(null);
        setManualTranscript("");
        queryClient.invalidateQueries({ queryKey: ["importedLinks"] });
      } else {
        toast.error(data.error || "Failed to save transcript");
      }
    },
    onError: () => toast.error("Failed to save transcript"),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadVideo(file),
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Video uploaded successfully!");
        queryClient.invalidateQueries({ queryKey: ["importedLinks"] });
      } else {
        toast.error(data.error || "Failed to upload video");
      }
    },
    onError: () => toast.error("Failed to upload video"),
  });

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("video/")) {
        uploadMutation.mutate(file);
      } else {
        toast.error("Please upload a video file (MP4, MOV, WebM)");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

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

        {/* Upload Zone — Primary Input */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className={cn(
            "relative border-2 border-dashed rounded-2xl p-8 text-center transition-all max-w-3xl",
            uploadMutation.isPending
              ? "border-primary/50 bg-primary/5"
              : "border-white/10 hover:border-primary/40 hover:bg-white/[0.02] bg-white/[0.01]"
          )}
        >
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={uploadMutation.isPending}
          />
          <div className="space-y-3 pointer-events-none">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              {uploadMutation.isPending ? (
                <Loader2 className="h-7 w-7 text-primary animate-spin" />
              ) : (
                <Upload className="h-7 w-7 text-primary" />
              )}
            </div>
            <div>
              <p className="font-bold text-base">
                {uploadMutation.isPending ? "Uploading video…" : "Drop your video here, or click to browse"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                MP4, MOV, WebM, MKV — up to 2GB
              </p>
            </div>
            <p className="text-[10px] text-amber-500/60 max-w-sm mx-auto">
              This is the fastest, most reliable way to add videos. Processing happens in your browser — no YouTube blocking issues.
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="relative max-w-3xl">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10" /></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or paste a link</span></div>
        </div>

        {/* URL Import — Secondary */}
        <form onSubmit={handleImport} className="flex flex-col sm:flex-row gap-3 max-w-3xl">
          <div className="relative flex-1">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste YouTube, TikTok, or any video link…"
              className="pl-11 h-12 bg-card border-white/10 focus:border-primary/50 transition-all text-base"
              disabled={importMutation.isPending}
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            className="h-12 px-8 font-bold text-base border-white/10 hover:border-primary/50"
            disabled={importMutation.isPending || !url.trim()}
          >
            {importMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <LinkIcon className="h-5 w-5 mr-2" />
            )}
            Import Link
          </Button>
        </form>

        {(importMutation.isPending || uploadMutation.isPending) && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 max-w-3xl">
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            <span>{uploadMutation.isPending ? "Uploading video to cloud storage…" : "Importing video and extracting transcript — this may take up to 2 minutes for long videos…"}</span>
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
              <h3 className="text-lg font-bold">No videos yet</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">Upload a video file or paste a YouTube link to get started.</p>
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
                      <iframe
                        src={getEmbedUrl(link.url)}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title={link.title || "Video preview"}
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

                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                          {link.title || "Untitled Video"}
                        </h3>
                        {link.sourceType === "upload" && (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-1.5 py-0.5 rounded border border-primary/30">
                            Upload
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                        {link.sourceType === "upload"
                          ? "Local File"
                          : (() => { try { return new URL(link.url).hostname.replace("www.", ""); } catch { return "Unknown"; } })()}
                      </p>
                    </div>

                    {/* Transcript Status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {link.transcript ? (
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-green-400/80 bg-green-500/10 px-2 py-1 rounded-md border border-green-500/20">
                          <CheckCircle2 className="h-3 w-3" />
                          Transcript ready
                        </div>
                      ) : transcribingId === link.id ? (
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#5865F2]/80 bg-[#5865F2]/10 px-2 py-1 rounded-md border border-[#5865F2]/20">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {browserTranscribe.stageLabel} {browserTranscribe.progress > 0 && `${browserTranscribe.progress}%`}
                        </div>
                      ) : link.sourceType === "upload" ? (
                        <>
                          <button
                            onClick={async () => {
                              setTranscribingId(link.id);
                              const result = await browserTranscribe.transcribe(link.url, link.id);
                              setTranscribingId(null);
                              if (result) {
                                queryClient.invalidateQueries({ queryKey: ["importedLinks"] });
                              }
                            }}
                            className="flex items-center gap-1.5 text-[10px] font-medium text-[#5865F2]/80 bg-[#5865F2]/10 px-2 py-1 rounded-md border border-[#5865F2]/20 hover:bg-[#5865F2]/20 transition-colors"
                          >
                            <Mic className="h-3 w-3" />
                            Transcribe with AI (browser)
                          </button>
                          <button
                            onClick={() => {
                              setTranscriptModalId(link.id);
                              setManualTranscript("");
                            }}
                            className="flex items-center gap-1.5 text-[10px] font-medium text-amber-400/80 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                          >
                            <AlertCircle className="h-3 w-3" />
                            Or paste manually
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setTranscriptModalId(link.id);
                            setManualTranscript("");
                          }}
                          className="flex items-center gap-1.5 text-[10px] font-medium text-amber-400/80 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                        >
                          <AlertCircle className="h-3 w-3" />
                          Transcript missing — click to paste
                        </button>
                      )}
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

      {/* Transcript Paste Modal */}
      {transcriptModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#5865F2]" />
                <h3 className="text-lg font-bold">Paste Transcript</h3>
              </div>
              <button
                onClick={() => { setTranscriptModalId(null); setManualTranscript(""); }}
                className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-400 font-semibold mb-1">YouTube is blocking auto-transcription</p>
              <p className="text-[10px] text-amber-500/80 leading-relaxed">
                Due to YouTube restrictions, our servers can't always download videos for transcription. Pasting the transcript manually lets you generate clips right away.
              </p>
            </div>

            <div className="rounded-lg bg-white/5 p-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">How to get the transcript</p>
              <ol className="text-[10px] text-white/50 space-y-0.5 list-decimal list-inside">
                <li>Open the video on <strong className="text-white/70">YouTube</strong></li>
                <li>Click <strong className="text-white/70">⋯ (More)</strong> below the video</li>
                <li>Select <strong className="text-white/70">Show transcript</strong></li>
                <li>Click <strong className="text-white/70">⋮</strong> in the transcript panel → <strong className="text-white/70">Toggle timestamps</strong> (off)</li>
                <li>Select all text (Ctrl+A / Cmd+A) and copy</li>
                <li>Paste it below and click <strong className="text-white/70">Save Transcript</strong></li>
              </ol>
            </div>

            <textarea
              value={manualTranscript}
              onChange={(e) => setManualTranscript(e.target.value)}
              placeholder="Paste video transcript here…"
              className="w-full h-40 bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:border-[#5865F2]/50"
            />

            <div className="flex gap-3">
              <Button
                className="flex-1 btn-gradient"
                onClick={() => {
                  if (!manualTranscript.trim() || !transcriptModalId) return;
                  transcriptMutation.mutate({ id: transcriptModalId, transcript: manualTranscript.trim() });
                }}
                disabled={!manualTranscript.trim() || transcriptMutation.isPending}
              >
                {transcriptMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Pencil className="h-4 w-4 mr-2" />
                )}
                Save Transcript
              </Button>
              <Button
                variant="outline"
                className="border-white/10"
                onClick={() => { setTranscriptModalId(null); setManualTranscript(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

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
