import React, { useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Upload, X, ImageIcon, Film, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const VIDEO_MAX_MB = 100;
const IMAGE_MAX_MB = 5;

interface UploadedMedia {
  url: string;
  name: string;
  type: "image" | "video";
}

interface MediaUploaderProps {
  onChange?: (urls: string[]) => void;
}

export function MediaUploader({ onChange }: MediaUploaderProps) {
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isVideo && !isImage) {
      toast.error("Only image and video files are supported.");
      return;
    }

    const maxMB = isVideo ? VIDEO_MAX_MB : IMAGE_MAX_MB;
    const fileMB = file.size / (1024 * 1024);
    if (fileMB > maxMB) {
      toast.error(`File too large. Max size: ${maxMB}MB for ${isVideo ? "video" : "image"} files.`);
      return;
    }

    setUploading(true);
    setProgress(10);

    // Simulate progress while uploading
    const tick = setInterval(() => {
      setProgress((p) => Math.min(p + 15, 85));
    }, 400);

    try {
      const res = await api.uploadMedia(file);
      clearInterval(tick);
      setProgress(100);

      if (res.success && res.data?.url) {
        const item: UploadedMedia = {
          url: res.data.url,
          name: file.name,
          type: isVideo ? "video" : "image",
        };
        const next = [...media, item];
        setMedia(next);
        onChange?.(next.map((m) => m.url));
        toast.success("Media uploaded successfully.");
      } else {
        toast.error(res.error ?? "Upload failed.");
      }
    } catch {
      clearInterval(tick);
      toast.error("Upload failed. Check your connection.");
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeItem = (idx: number) => {
    const next = media.filter((_, i) => i !== idx);
    setMedia(next);
    onChange?.(next.map((m) => m.url));
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={cn(
          "border-2 border-dashed border-border/60 rounded-xl p-4 text-center transition-colors cursor-pointer hover:border-primary/40 hover:bg-primary/5",
          uploading && "pointer-events-none opacity-60",
        )}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Uploading…</p>
            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-6 w-6 text-muted-foreground/50" />
            <p className="text-xs font-medium">Upload image or video</p>
            <p className="text-[11px] text-muted-foreground">
              Video ≤ {VIDEO_MAX_MB}MB · Image ≤ {IMAGE_MAX_MB}MB
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {/* Uploaded items */}
      {media.length > 0 && (
        <div className="space-y-1.5">
          {media.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 p-2"
            >
              {item.type === "image" ? (
                <img
                  src={item.url}
                  alt={item.name}
                  className="w-10 h-7 object-cover rounded shrink-0"
                />
              ) : (
                <div className="w-10 h-7 bg-muted rounded shrink-0 flex items-center justify-center">
                  <Film className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <span className="text-xs truncate flex-1 text-muted-foreground">{item.name}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 hover:text-destructive"
                onClick={() => removeItem(idx)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
