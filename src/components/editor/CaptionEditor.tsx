import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

const EMOJIS = ["🔥", "💥", "😂", "🎯", "✅", "⚡", "👀", "🚀", "💡", "😱", "🤯", "🙌"];

interface CaptionEditorProps {
  initialCaption?: string;
  onChange?: (lines: string[]) => void;
}

export function CaptionEditor({ initialCaption = "", onChange }: CaptionEditorProps) {
  const [lines, setLines] = useState<string[]>([]);

  // Split caption into lines on mount / when source changes
  useEffect(() => {
    if (!initialCaption) {
      setLines([""]);
      return;
    }
    // Split by sentence endings or newlines
    const split = initialCaption
      .split(/(?<=[.!?])\s+|\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    setLines(split.length ? split : [initialCaption]);
  }, [initialCaption]);

  const update = (newLines: string[]) => {
    setLines(newLines);
    onChange?.(newLines);
  };

  const handleChange = (i: number, val: string) => {
    const next = [...lines];
    next[i] = val;
    update(next);
  };

  const handleEmoji = (i: number, emoji: string) => {
    const next = [...lines];
    next[i] = `${emoji} ${next[i]}`;
    update(next);
  };

  const addLine = () => update([...lines, ""]);

  const removeLine = (i: number) => {
    if (lines.length <= 1) return;
    update(lines.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <div key={i} className="flex flex-col gap-1 group">
          <div className="flex gap-1.5 items-center">
            <Input
              value={line}
              onChange={(e) => handleChange(i, e.target.value)}
              placeholder={`Caption line ${i + 1}…`}
              className="h-8 text-xs flex-1"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-muted-foreground/50 hover:text-destructive"
              onClick={() => removeLine(i)}
              disabled={lines.length <= 1}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {/* Emoji picker row */}
          <div className="flex flex-wrap gap-1 pl-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => handleEmoji(i, e)}
                className="text-base leading-none hover:scale-125 transition-transform"
                title={`Add ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}

      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1.5 w-full"
        onClick={addLine}
      >
        <Plus className="h-3 w-3" />
        Add caption line
      </Button>
    </div>
  );
}

export function CaptionOverlay({ lines, textStyle = "classic" }: { lines: string[], textStyle?: string }) {
  const text = lines.filter(Boolean).join(" ");
  if (!text) return null;

  let styles: React.CSSProperties = {
    textShadow: "0 0 8px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.8)",
  };
  let className = "text-center text-white font-bold text-[15px] leading-snug max-w-[80%]";

  if (textStyle === "glow") {
    styles.textShadow = "0 0 10px rgba(59, 130, 246, 0.8), 0 0 20px rgba(59, 130, 246, 0.4)";
    className = "text-center text-white font-bold text-lg leading-snug max-w-[80%] uppercase tracking-wide";
  } else if (textStyle === "bold") {
    styles.textShadow = "0 3px 0px rgba(0,0,0,0.9), 0 0 5px rgba(0,0,0,0.5)";
    className = "text-center text-[#ffcc00] font-black text-xl leading-none max-w-[80%] uppercase tracking-tighter";
  } else if (textStyle === "neon") {
    styles.textShadow = "0 0 5px #fff, 0 0 10px #fff, 0 0 20px #ff00de, 0 0 30px #ff00de";
    className = "text-center text-white font-black text-xl leading-snug max-w-[80%] italic";
  }

  return (
    <div className="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-none px-4">
      <div
        className={className}
        style={styles}
      >
        {text}
      </div>
    </div>
  );
}
