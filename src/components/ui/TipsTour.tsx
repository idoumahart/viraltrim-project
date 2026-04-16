import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tip {
  id: string;
  title: string;
  body: string;
  page?: string; // optional: only show this tip on this pathname
}

const TIPS: Tip[] = [
  {
    id: "viral-search",
    title: "Viral Search",
    body: "Search any topic across YouTube, TikTok, Instagram, and more. Click Studio to open any result directly in the editor.",
  },
  {
    id: "editor-timeline",
    title: "Timeline Editing",
    body: "Drag the coloured handles on the timeline to trim your clip. The active region between the handles is what gets saved.",
  },
  {
    id: "editor-captions",
    title: "Adding Captions",
    body: "Go to the Captions tab in the editor sidebar. Each line becomes a caption overlay on the video. Hover a line to reveal emoji shortcuts.",
  },
  {
    id: "editor-combine",
    title: "Combining Clips",
    body: "Open the Combine tab to add any of your saved clips into a sequence. Drag to reorder. Save to persist the sequence.",
  },
  {
    id: "editor-upload",
    title: "Upload Your Own Media",
    body: "Use the Upload tab to bring in your own images (≤5 MB) or videos (≤100 MB) and include them in your clip.",
  },
  {
    id: "tier-switcher",
    title: "Dev Tier Override",
    body: "As an owner, you can test different tier limits without changing your plan. Use the amber widget in the sidebar to switch tiers temporarily.",
    page: "owner",
  },
  {
    id: "edit-limits",
    title: "Edit Limits",
    body: "Free: 3 edits · Pro: 10 edits · Agency: 20 edits per clip. Upgrade anytime from the Billing page.",
  },
  {
    id: "schedule",
    title: "Scheduling Posts",
    body: "Head to the Schedule page to set a publishing date/time for any clip. Great for maintaining a consistent posting cadence.",
  },
];

const STORAGE_KEY = "vt_tips_dismissed";

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function dismiss(id: string) {
  const prev = getDismissed();
  if (!prev.includes(id)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...prev, id]));
  }
}

export function TipsTour() {
  const [visible, setVisible] = useState<Tip[]>([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dismissed = getDismissed();
    const remaining = TIPS.filter((t) => !dismissed.includes(t.id) && t.page !== "owner");
    setVisible(remaining);
    setOpen(remaining.length > 0);
  }, []);

  if (!open || visible.length === 0) return null;

  const tip = visible[idx];

  const handleDismissCurrent = () => {
    dismiss(tip.id);
    const next = visible.filter((t) => t.id !== tip.id);
    if (next.length === 0) {
      setOpen(false);
      setVisible([]);
    } else {
      setVisible(next);
      setIdx(Math.min(idx, next.length - 1));
    }
  };

  const handleDismissAll = () => {
    visible.forEach((t) => dismiss(t.id));
    setOpen(false);
    setVisible([]);
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 w-72 animate-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-xl border border-amber-500/30 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50 bg-amber-500/5">
          <Lightbulb className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-xs font-bold flex-1">Quick Tips</span>
          <span className="text-[10px] text-muted-foreground">
            {idx + 1}/{visible.length}
          </span>
          <button onClick={() => setOpen(false)} className="text-muted-foreground/50 hover:text-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-3 space-y-2">
          <p className="text-xs font-semibold">{tip.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{tip.body}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 px-3 pb-3">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={idx >= visible.length - 1}
            onClick={() => setIdx((i) => Math.min(visible.length - 1, i + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] text-muted-foreground ml-auto"
            onClick={handleDismissCurrent}
          >
            Got it
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] text-muted-foreground/50"
            onClick={handleDismissAll}
          >
            Dismiss all
          </Button>
        </div>
      </div>
    </div>
  );
}
