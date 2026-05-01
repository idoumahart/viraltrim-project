import { useEffect, useRef } from "react";

interface Orb {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  color: string;
  opacity: number;
}

export function FloatingOrbs() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let w = 0;
    let h = 0;

    const colors = [
      "#5865F2",
      "#00D4AA",
      "#8B5CF6",
      "#0EA5E9",
      "#F43F5E",
    ];

    const orbs: Orb[] = Array.from({ length: 6 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      radius: 80 + Math.random() * 120,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 0.03 + Math.random() * 0.04,
    }));

    function resize() {
      w = canvas!.width = canvas!.offsetWidth * window.devicePixelRatio;
      h = canvas!.height = canvas!.offsetHeight * window.devicePixelRatio;
      ctx!.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);

      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;

        if (orb.x < -orb.radius) orb.x = w + orb.radius;
        if (orb.x > w + orb.radius) orb.x = -orb.radius;
        if (orb.y < -orb.radius) orb.y = h + orb.radius;
        if (orb.y > h + orb.radius) orb.y = -orb.radius;

        const gradient = ctx!.createRadialGradient(
          orb.x, orb.y, 0,
          orb.x, orb.y, orb.radius
        );
        gradient.addColorStop(0, orb.color + Math.round(orb.opacity * 255).toString(16).padStart(2, "0"));
        gradient.addColorStop(1, "transparent");

        ctx!.fillStyle = gradient;
        ctx!.beginPath();
        ctx!.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      animationId = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ filter: "blur(60px)" }}
    />
  );
}
