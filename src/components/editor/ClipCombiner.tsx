import React, { useEffect, useState } from "react";
import { api, type Clip } from "@/lib/api-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { GripVertical, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ClipCombinerProps {
  currentClipId?: string;
  onChange?: (ids: string[]) => void;
}

export function ClipCombiner({ currentClipId, onChange }: ClipCombinerProps) {
  const [library, setLibrary] = useState<Clip[]>([]);
  const [sequence, setSequence] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    api.getClips().then((res) => {
      if (!isMounted) return;
      if (res.success && res.data) {
        // Exclude the current clip from the library
        setLibrary(res.data.filter((c) => c.id !== currentClipId));
      }
      setLoading(false);
    });
    return () => { isMounted = false; };
  }, [currentClipId]);

  const addClip = (clipId: string) => {
    const clip = library.find((c) => c.id === clipId);
    if (!clip) return;
    if (sequence.some((c) => c.id === clipId)) {
      toast.error("Clip already in sequence");
      return;
    }
    const next = [...sequence, clip];
    setSequence(next);
    onChange?.(next.map((c) => c.id));
  };

  const removeClip = (idx: number) => {
    const next = sequence.filter((_, i) => i !== idx);
    setSequence(next);
    onChange?.(next.map((c) => c.id));
  };

  const moveClip = (from: number, to: number) => {
    const next = [...sequence];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setSequence(next);
    onChange?.(next.map((c) => c.id));
  };

  const availableClips = library.filter((c) => !sequence.some((s) => s.id === c.id));

  return (
    <div className="space-y-3">
      {/* Dropdown to pick a clip */}
      <Select onValueChange={addClip} value="">
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={loading ? "Loading clips…" : availableClips.length === 0 ? "No more clips" : "Add clip from library…"} />
        </SelectTrigger>
        <SelectContent>
          {availableClips.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              <span className="flex items-center gap-2">
                {c.thumbnail ? (
                  <img src={c.thumbnail} className="w-8 h-5 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-8 h-5 bg-muted rounded shrink-0" />
                )}
                <span className="truncate max-w-[160px]">{c.title}</span>
                {c.duration && (
                  <span className="text-muted-foreground ml-auto shrink-0">{c.duration}</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sequence list */}
      {sequence.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
            Sequence ({sequence.length} clip{sequence.length !== 1 ? "s" : ""})
          </p>
          {sequence.map((clip, idx) => (
            <div
              key={clip.id}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null && dragIdx !== idx) moveClip(dragIdx, idx);
                setDragIdx(null);
              }}
              className={cn(
                "flex items-center gap-2 rounded-md border border-border/60 bg-card/60 p-1.5 cursor-grab active:cursor-grabbing transition-opacity",
                dragIdx === idx && "opacity-40"
              )}
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              {clip.thumbnail ? (
                <img src={clip.thumbnail} className="w-10 h-6 object-cover rounded shrink-0" />
              ) : (
                <div className="w-10 h-6 bg-muted rounded shrink-0" />
              )}
              <span className="text-xs truncate flex-1">{clip.title}</span>
              {clip.duration && (
                <span className="text-[10px] text-muted-foreground shrink-0">{clip.duration}</span>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 shrink-0 text-muted-foreground/40 hover:text-destructive"
                onClick={() => removeClip(idx)}
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
