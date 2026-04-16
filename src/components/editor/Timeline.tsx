import React, { useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface TimelineProps {
  duration: number;       // total clip duration in seconds
  startSec: number;
  endSec: number;
  currentTime: number;
  onStartChange: (s: number) => void;
  onEndChange: (s: number) => void;
  label?: string;
  color?: string;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function Timeline({
  duration,
  startSec,
  endSec,
  currentTime,
  onStartChange,
  onEndChange,
  label = "VIDEO",
  color = "hsl(var(--primary))",
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | null>(null);

  const toPercent = (s: number) => (duration > 0 ? (s / duration) * 100 : 0);
  const toSeconds = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * duration);
    },
    [duration],
  );

  const onPointerDown = (handle: "start" | "end") => (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = handle;
  };

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      const s = toSeconds(e.clientX);
      if (dragging.current === "start") {
        onStartChange(Math.min(s, endSec - 1));
      } else {
        onEndChange(Math.max(s, startSec + 1));
      }
    },
    [toSeconds, startSec, endSec, onStartChange, onEndChange],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const startPct = toPercent(startSec);
  const endPct = toPercent(endSec);
  const playPct = toPercent(currentTime);

  return (
    <div className="select-none px-1">
      {/* Label row */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
          {label}
        </span>
        <span className="text-[11px] font-mono text-muted-foreground">
          {fmt(startSec)} – {fmt(endSec)}
          <span className="ml-1.5 text-primary font-semibold">
            ({fmt(endSec - startSec)})
          </span>
        </span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-7 rounded-md bg-muted/60 border border-border/50 overflow-visible cursor-crosshair"
      >
        {/* Dimmed region before start */}
        <div
          className="absolute inset-y-0 left-0 rounded-l-md bg-background/40"
          style={{ width: `${startPct}%` }}
        />
        {/* Active region */}
        <div
          className="absolute inset-y-0 rounded-sm opacity-80"
          style={{
            left: `${startPct}%`,
            width: `${endPct - startPct}%`,
            background: `${color}33`,
            borderLeft: `2px solid ${color}`,
            borderRight: `2px solid ${color}`,
          }}
        />
        {/* Dimmed region after end */}
        <div
          className="absolute inset-y-0 right-0 rounded-r-md bg-background/40"
          style={{ width: `${100 - endPct}%` }}
        />

        {/* Playhead */}
        <div
          className="absolute inset-y-0 w-px bg-white/60 pointer-events-none"
          style={{ left: `${playPct}%` }}
        />

        {/* Start handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-6 rounded cursor-ew-resize flex items-center justify-center z-10 shadow-md"
          style={{ left: `${startPct}%`, background: color }}
          onPointerDown={onPointerDown("start")}
        >
          <div className="w-0.5 h-3 bg-white/60 rounded-full" />
        </div>

        {/* End handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-6 rounded cursor-ew-resize flex items-center justify-center z-10 shadow-md"
          style={{ left: `${endPct}%`, background: color }}
          onPointerDown={onPointerDown("end")}
        >
          <div className="w-0.5 h-3 bg-white/60 rounded-full" />
        </div>
      </div>
    </div>
  );
}
