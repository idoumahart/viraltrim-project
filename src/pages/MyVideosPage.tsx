import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Plus, Trash2, Video, FileText, Sparkles, Loader2, Play } from "lucide-react";
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

export default function MyVideosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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
    if (!url.trim()) return;
    importMutation.mutate(url);
  };

  const handleGenerate = (video: any) => {
    navigate(`/studio/generator/${video.id}`);
  };

  return (
    <AppLayout container contentClassName="space-y-10 pb-20">
      {/* Hero / Import Section */}
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-display font-bold">My Videos</h1>
          <p className="text-muted-foreground text-lg">Import videos from YouTube, TikTok, or Instagram to start generating hooks.</p>
        </div>

        <form onSubmit={handleImport} className="flex flex-col sm:flex-row gap-3 max-w-3xl">
          <div className="relative flex-1">
            <Video className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste video URL here..."
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
            Import Video
          </Button>
        </form>
      </div>

      {/* Video Grid */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Imported Library
            <Badge variant="outline" className="ml-2 bg-white/5 border-white/10 opacity-70">
              {links.length}
            </Badge>
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
            {links.map((link: any) => (
              <Card key={link.id} className="group overflow-hidden bg-card border-white/5 hover:border-primary/40 transition-all duration-300 shadow-xl">
                <div className="aspect-video relative bg-black">
                  {link.thumbnail ? (
                    <img src={link.thumbnail} alt={link.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/10">
                      <Video className="h-12 w-12" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 backdrop-blur-[2px]">
                    <Button 
                      className="rounded-full h-12 w-12 bg-primary hover:scale-110 transition-transform"
                      onClick={() => handleGenerate(link)}
                    >
                      <Play className="h-6 w-6 ml-0.5 fill-current" />
                    </Button>
                  </div>
                  {link.duration && (
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono font-bold text-white z-20">
                      {link.duration}
                    </div>
                  )}
                </div>
                <CardContent className="p-4 space-y-4">
                  <div className="space-y-1">
                    <h3 className="font-bold text-sm line-clamp-2 leading-tight group-hover:text-primary transition-colors">{link.title || "Untitled Video"}</h3>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                      Source: {new URL(link.url).hostname.replace('www.', '')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button 
                      className="flex-1 btn-gradient text-xs font-bold h-9"
                      onClick={() => handleGenerate(link)}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      Generate Clips
                    </Button>
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
            ))}
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

function Badge({ children, className, variant }: any) {
  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
      variant === "outline" ? "border border-white/10" : "bg-primary/20 text-primary",
      className
    )}>
      {children}
    </span>
  );
}
