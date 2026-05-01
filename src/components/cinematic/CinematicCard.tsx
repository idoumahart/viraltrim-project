import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CinematicCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}

export function CinematicCard({ children, className, glowColor = "#5865F2" }: CinematicCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;
    setRotateX((-mouseY / (rect.height / 2)) * 8);
    setRotateY((mouseX / (rect.width / 2)) * 8);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setIsHovered(false);
  };

  return (
    <motion.div
      ref={cardRef}
      className={cn(
        "relative rounded-2xl border border-white/[0.08] bg-card/40 backdrop-blur-xl overflow-hidden",
        className
      )}
      style={{
        transformStyle: "preserve-3d",
        perspective: "1000px",
      }}
      animate={{
        rotateX,
        rotateY,
        scale: isHovered ? 1.02 : 1,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
    >
      {/* Inner glow */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 pointer-events-none"
        style={{
          opacity: isHovered ? 0.15 : 0,
          boxShadow: `inset 0 0 60px ${glowColor}40`,
        }}
      />
      {/* Border glow */}
      <div
        className="absolute -inset-[1px] rounded-2xl opacity-0 transition-opacity duration-500 pointer-events-none"
        style={{
          opacity: isHovered ? 0.5 : 0,
          background: `linear-gradient(135deg, ${glowColor}30, transparent 50%, ${glowColor}20)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
