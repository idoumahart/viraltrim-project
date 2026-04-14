import React, { useEffect, useRef, useState } from "react";
import { Sparkles, TrendingUp, Scissors, Zap, Share2, Play, ChevronRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PricingTable } from "@/components/pricing-table";

function Hero3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    let animationFrameId = 0;
    const particles: { x: number; y: number; z: number; size: number; color: string }[] = [];
    const particleCount = 80;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    const init = () => {
      particles.length = 0;
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: (Math.random() - 0.5) * 1500,
          y: (Math.random() - 0.5) * 1500,
          z: Math.random() * 2000,
          size: Math.random() * 1.5 + 0.5,
          color: i % 2 === 0 ? "#0ea5e9" : "#8b5cf6",
        });
      }
    };
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const fov = 1000;
      for (const p of particles) {
        p.z -= 1.2;
        if (p.z <= 0) {
          p.z = 2000;
        }
        const scale = fov / (fov + p.z);
        const x = p.x * scale + centerX;
        const y = p.y * scale + centerY;
        const s = p.size * scale * 2;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1, scale * 1.2);
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      animationFrameId = requestAnimationFrame(draw);
    };
    resize();
    init();
    window.addEventListener("resize", resize);
    draw();
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 h-full w-full pointer-events-none opacity-60"
      aria-hidden
    />
  );
}

export function HomePage() {
  const [searchParams] = useSearchParams();
  const [annual, setAnnual] = useState(false);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref?.trim()) {
      try {
        if (!localStorage.getItem("viraltrim_ref")) {
          localStorage.setItem("viraltrim_ref", ref.trim());
        }
      } catch {
        /* ignore */
      }
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Hero3D />
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="font-display text-xl font-bold tracking-tight">
            viraltrim
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="ghost" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button className="btn-gradient" asChild>
              <Link to="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative px-4 pt-24 pb-32 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1 text-xs uppercase tracking-widest text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI-powered viral clipping
            </div>
            <h1 className="font-display text-5xl sm:text-6xl font-bold tracking-tight">
              Turn any video into viral content
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Discover trends, clip with AI, caption and schedule — powered by Cloudflare Workers and Gemini.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" className="btn-gradient gap-2" asChild>
                <Link to="/register">
                  Start for free <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/login">
                  <Play className="h-4 w-4 mr-2" />
                  Open app
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="features" className="content-auto border-t border-border py-24 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: TrendingUp, title: "Viral discovery", desc: "Gemini-curated trends for short-form." },
              { icon: Scissors, title: "Auto-clip", desc: "Smart ranges with 90s max enforcement." },
              { icon: Zap, title: "Captions", desc: "Platform-aware copy with required credit line." },
              { icon: Share2, title: "Schedule", desc: "Plan drops across platforms." },
              { icon: Sparkles, title: "Worker API", desc: "Secure billing, DMCA, and webhooks on the edge." },
              { icon: Play, title: "Studio", desc: "Edit, preview, and ship from one shell." },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-xl border border-border bg-card p-6 hover:border-primary/40 transition-colors"
              >
                <Icon className="h-8 w-8 text-primary mb-3" />
                <h3 className="font-display text-lg font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="content-auto border-t border-border py-24 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl text-center mb-12 space-y-4">
            <h2 className="font-display text-3xl sm:text-4xl font-bold">Pricing</h2>
            <p className="text-muted-foreground">Simple tiers. Annual toggle is UI-only for now.</p>
            <div className="flex justify-center gap-2">
              <Button variant={!annual ? "default" : "outline"} size="sm" onClick={() => setAnnual(false)}>
                Monthly
              </Button>
              <Button variant={annual ? "default" : "outline"} size="sm" onClick={() => setAnnual(true)}>
                Annual (save 2 mo)
              </Button>
            </div>
          </div>
          <PricingTable />
        </section>
      </main>

      <footer className="border-t border-border py-12 px-4 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} viraltrim · Coded Motion Studio</p>
        <div className="mt-4 flex justify-center gap-6">
          <Link to="/register" className="hover:text-foreground">
            Sign up
          </Link>
          <a href="https://codedmotion.studio" className="hover:text-foreground" target="_blank" rel="noreferrer">
            Agency
          </a>
        </div>
      </footer>
    </div>
  );
}
