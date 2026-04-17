import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Instagram, 
  Youtube, 
  Twitter, 
  Download,
  CheckCircle2,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (data: { platform: string; date: Date }) => Promise<void>;
  videoUrl?: string;
  clipTitle?: string;
}

export function ScheduleModal({ isOpen, onClose, onSchedule, videoUrl, clipTitle }: ScheduleModalProps) {
  const [date, setDate] = useState<Date>(new Date());
  const [platform, setPlatform] = useState<string>("tiktok");
  const [scheduling, setScheduling] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSchedule = async () => {
    setScheduling(true);
    try {
      await onSchedule({ platform, date });
      setSuccess(true);
    } catch (err) {
      console.error(err);
    } finally {
      setScheduling(false);
    }
  };

  if (success) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md bg-[#18181B] border-white/10 text-white">
          <div className="flex flex-col items-center justify-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
            </div>
            <div className="text-center">
              <DialogTitle className="text-xl font-bold">Successfully Scheduled!</DialogTitle>
              <DialogDescription className="text-white/50 mt-1">
                Your clip "{clipTitle}" is queued for {format(date, "PPP")}.
              </DialogDescription>
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="flex-1 border-white/10 text-white/70" onClick={onClose}>
              Done
            </Button>
            <Button className="flex-1 bg-[#5865F2] hover:bg-[#4752C4]" onClick={() => window.open("/studio/posts", "_blank")}>
              View Queue <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-[#18181B] border-white/10 text-white p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-[#5865F2]/20 to-transparent p-6 pb-0">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              Finish & Schedule
            </DialogTitle>
            <DialogDescription className="text-white/50">
              Your video is rendered and ready. Where should we post it?
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-6">
          {/* Platform Selector */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-white/30">Select Platform</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "tiktok", icon: "TikTok", color: "bg-black" },
                { id: "instagram", icon: Instagram, color: "bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500" },
                { id: "youtube", icon: Youtube, color: "bg-red-600" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all",
                    platform === p.id 
                      ? "bg-white/10 border-white/40 ring-2 ring-[#5865F2]/50" 
                      : "bg-white/5 border-white/5 hover:border-white/20"
                  )}
                >
                  {typeof p.icon === "string" ? (
                    <span className="font-black text-sm">{p.icon}</span>
                  ) : (
                    <p.icon className="h-5 w-5" />
                  )}
                  <span className="text-[10px] uppercase font-bold tracking-tighter opacity-70">{p.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date Picker */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-white/30">Scheduled Time</label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "flex-1 justify-start text-left font-normal bg-white/5 border-white/10 text-white/70",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#18181B] border-white/10" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    initialFocus
                    className="text-white bg-[#18181B]"
                  />
                </PopoverContent>
              </Popover>
              <Select defaultValue="12:00">
                <SelectTrigger className="w-[110px] bg-white/5 border-white/10 text-white/70">
                  <SelectValue placeholder="Time" />
                </SelectTrigger>
                <SelectContent className="bg-[#18181B] border-white/10 text-white">
                  {["09:00", "12:00", "15:00", "18:00", "21:00"].map((t) => (
                    <SelectItem key={t} value={t}>{t} PM</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Download Fallback */}
          {videoUrl && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#5865F2]/20 flex items-center justify-center">
                  <Download className="h-5 w-5 text-[#818CF8]" />
                </div>
                <div>
                  <p className="text-xs font-bold">Manual Download</p>
                  <p className="text-[10px] text-white/40">Download MP4 for manual upload</p>
                </div>
              </div>
              <Button size="sm" variant="ghost" className="h-8 text-xs hover:bg-white/10" asChild>
                <a href={videoUrl} download={`${clipTitle || "clip"}.mp4`} target="_blank" rel="noreferrer">
                  Download
                </a>
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="bg-white/[0.03] p-4 flex gap-2">
          <Button variant="ghost" className="text-white/40 hover:text-white" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            className="flex-1 bg-[#5865F2] hover:bg-[#4752C4] font-bold"
            disabled={scheduling}
            onClick={handleSchedule}
          >
            {scheduling ? "Scheduling..." : "Confirm Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
