import React, { useRef, useCallback, useEffect, useState } from "react";
import { Music, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Timeline } from "./Timeline";

interface AudioTimelineProps {
  onAudioChange?: (file: File | null) => void;
  onTrimChange?: (start: number, end: number) => void;
}

export function AudioTimeline({ onAudioChange, onTrimChange }: AudioTimelineProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(0);
  const [bars, setBars] = useState<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) return;

    setAudioFile(file);
    onAudioChange?.(file);

    // Decode and extract waveform using Web Audio API
    try {
      const ctx = new AudioContext();
      const buffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buffer);
      const dur = decoded.duration;
      setDuration(dur);
      setStartSec(0);
      setEndSec(Math.round(dur));
      onTrimChange?.(0, Math.round(dur));

      // Downsample channel data to ~80 bars for waveform visualization
      const channelData = decoded.getChannelData(0);
      const step = Math.floor(channelData.length / 80);
      const samples: number[] = [];
      for (let i = 0; i < 80; i++) {
        let sum = 0;
        const start = i * step;
        for (let j = start; j < start + step; j++) {
          sum += Math.abs(channelData[j] ?? 0);
        }
        samples.push(sum / step);
      }
      const max = Math.max(...samples, 0.001);
      setBars(samples.map((s) => s / max));

      await ctx.close();
    } catch {
      // Could not decode — just show file name without waveform
      setBars([]);
    }
  };

  const handleStartChange = useCallback(
    (s: number) => {
      setStartSec(s);
      onTrimChange?.(s, endSec);
    },
    [endSec, onTrimChange],
  );

  const handleEndChange = useCallback(
    (s: number) => {
      setEndSec(s);
      onTrimChange?.(startSec, s);
    },
    [startSec, onTrimChange],
  );

  const handleRemove = () => {
    setAudioFile(null);
    setDuration(0);
    setBars([]);
    onAudioChange?.(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      {!audioFile ? (
        <div
          className="border border-dashed border-border/60 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors group"
          onClick={() => inputRef.current?.click()}
        >
          <div className="w-8 h-8 rounded-md bg-muted/60 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
            <Music className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
          </div>
          <div>
            <p className="text-xs font-medium">Add background audio</p>
            <p className="text-[11px] text-muted-foreground">MP3, WAV, AAC — optional</p>
          </div>
          <Upload className="h-3.5 w-3.5 text-muted-foreground/50 ml-auto" />
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {/* File row */}
          <div className="flex items-center gap-2">
            <Music className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs truncate flex-1 text-muted-foreground">{audioFile.name}</span>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleRemove}>
              <X className="h-3 w-3" />
            </Button>
          </div>

          {/* Waveform bars (if decoded) */}
          {bars.length > 0 && (
            <div className="flex items-end gap-px h-8 pb-1 px-1">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-purple-500/60"
                  style={{ height: `${Math.max(4, h * 100)}%` }}
                />
              ))}
            </div>
          )}

          {/* Trim handles */}
          {duration > 0 && (
            <Timeline
              duration={duration}
              startSec={startSec}
              endSec={endSec}
              currentTime={0}
              onStartChange={handleStartChange}
              onEndChange={handleEndChange}
              label="AUDIO"
              color="hsl(270 70% 65%)"
            />
          )}
        </div>
      )}
    </div>
  );
}
