import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface GlowButtonProps {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}

export function GlowButton({
  children,
  className,
  variant = "primary",
  size = "md",
  onClick,
  href,
  type = "button",
  disabled,
}: GlowButtonProps) {
  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  const variantClasses = {
    primary:
      "bg-gradient-to-r from-cyan-500 to-purple-500 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105",
    secondary:
      "bg-white/[0.06] backdrop-blur-md border border-white/[0.12] text-white hover:bg-white/[0.1] hover:border-white/20",
    ghost:
      "text-white/70 hover:text-white hover:bg-white/[0.05]",
  };

  const baseClasses = cn(
    "relative inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-300",
    sizeClasses[size],
    variantClasses[variant],
    disabled && "opacity-50 cursor-not-allowed hover:scale-100 hover:shadow-none",
    className
  );

  if (href) {
    return (
      <a href={href} className={baseClasses} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} className={baseClasses} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
