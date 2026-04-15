import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const FUNNY_MESSAGES = [
  "Teaching AI to watch TikToks...",
  "Convincing the algorithm you're funny...",
  "Watching 10,000 hours of podcasts...",
  "Checking for copyright strikes...",
  "Finding the dopamine hooks...",
  "Cutting out the boring parts...",
  "Adding subway surfers gameplay...",
  "Brewing coffee for the GPU...",
  "Go checkout codedmotion.studio while you wait!",
];

export function QuirkyLoader({
  className,
  messages = FUNNY_MESSAGES,
  intervalMs = 3500,
}: {
  className?: string;
  messages?: string[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsVisible(false); // fade out
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % messages.length);
        setIsVisible(true); // fade in
      }, 300);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [messages.length, intervalMs]);

  return (
    <div className={cn("flex flex-col items-center justify-center space-y-4 p-8", className)}>
      <Loader2 className="w-12 h-12 text-[#25db72] animate-spin drop-shadow-[0_0_15px_rgba(37,219,114,0.5)]" />
      <div className="h-6 overflow-hidden">
        <p
          className={cn(
            "text-sm font-medium text-white/80 transition-all duration-300",
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          )}
        >
          {messages[index]}
        </p>
      </div>
    </div>
  );
}
