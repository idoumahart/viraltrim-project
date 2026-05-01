import React, { useEffect, Suspense, lazy } from "react";
import {
  Sparkles,
  TrendingUp,
  Scissors,
  Zap,
  Share2,
  Play,
  ChevronRight,
  Wand2,
  Film,
  Mic,
  Video,
  ArrowRight,
  Star,
  Users,
  Clock,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PricingTable } from "@/components/pricing-table";
import { GradientText } from "@/components/cinematic/GradientText";
import { FloatingOrbs } from "@/components/cinematic/FloatingOrbs";
import { ScrollReveal } from "@/components/cinematic/ScrollReveal";
import { AnimatedCounter } from "@/components/cinematic/AnimatedCounter";
import { CinematicCard } from "@/components/cinematic/CinematicCard";
import { GlowButton } from "@/components/cinematic/GlowButton";

// Lazy-load R3F particle field to avoid bloating non-landing bundles
const ParticleField = lazy(() =>
  import("@/components/cinematic/ParticleField").then((m) => ({ default: m.ParticleField }))
);

const features = [
  {
    icon: Wand2,
    title: "AI Script Writer",
    desc: "Generate viral scripts in seconds. Choose your tone, topic, and length — Gemini does the rest.",
    color: "#06b6d4",
  },
  {
    icon: Mic,
    title: "AI Voiceover",
    desc: "ElevenLabs-powered voices that sound human. 40+ voices, multiple languages, emotion control.",
    color: "#8b5cf6",
  },
  {
    icon: Film,
    title: "Stock Footage",
    desc: "Auto-matched Pexels clips for every scene. HD quality, royalty-free, instant download.",
    color: "#ec4899",
  },
  {
    icon: Video,
    title: "Auto-Editing",
    desc: "Cloud Run renders your video in seconds. Cuts, transitions, captions — all automated.",
    color: "#f59e0b",
  },
  {
    icon: Scissors,
    title: "Clip Generator",
    desc: "Upload any video and get AI-suggested viral clips with smart captions and hooks.",
    color: "#10b981",
  },
  {
    icon: Share2,
    title: "One-Click Export",
    desc: "9:16, 16:9, 1:1 — export in any format. Direct to TikTok, YouTube Shorts, Instagram Reels.",
    color: "#3b82f6",
  },
];

const steps = [
  { num: "01", title: "Describe your idea", desc: "Type a topic, paste a script, or let AI generate one for you." },
  { num: "02", title: "Pick a voice & footage", desc: "Choose from 40+ AI voices and auto-matched stock clips." },
  { num: "03", title: "Render & export", desc: "Cloud-render in seconds. Download or share directly." },
];

const stats = [
  { icon: Clock, value: 60, suffix: "s", label: "Avg. render time" },
  { icon: Film, value: 10000, suffix: "+", label: "Clips generated" },
  { icon: Users, value: 500, suffix: "+", label: "Active creators" },
  { icon: Star, value: 4.9, suffix: "", label: "User rating", decimals: 1 },
];

export function HomePage() {
  const [searchParams] = useSearchParams();

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
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden">
      {/* Ambient background */}
      <FloatingOrbs />

      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="font-display text-xl font-bold tracking-tight flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            viraltrim
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link to="/login">Log in</Link>
            </Button>
            <GlowButton href="/register" size="sm">
              Get started <ChevronRight className="h-4 w-4" />
            </GlowButton>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative min-h-[90vh] flex items-center justify-center px-4 sm:px-6 lg:px-8 overflow-hidden">
          {/* R3F Particle background */}
          <div className="absolute inset-0 z-0 opacity-70">
            <Suspense fallback={null}>
              <ParticleField />
            </Suspense>
          </div>

          <div className="relative z-10 mx-auto max-w-5xl text-center space-y-8">
            <ScrollReveal delay={0}>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-xs uppercase tracking-widest text-cyan-400">
                <Sparkles className="h-3.5 w-3.5" />
                ViralTrim 2.0 is here
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.1}>
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
                Turn ideas into{" "}
                <GradientText className="text-glow">viral videos</GradientText>
                <br className="hidden sm:block" />
                in under a minute
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={0.2}>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                AI script writer, voiceover, stock footage, and auto-editing — all in one studio.
                No editing skills required.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.3}>
              <div className="flex flex-wrap justify-center gap-4">
                <GlowButton size="lg" href="/register">
                  Start creating free <ArrowRight className="h-5 w-5" />
                </GlowButton>
                <GlowButton variant="secondary" size="lg" href="/login">
                  <Play className="h-5 w-5" />
                  Open app
                </GlowButton>
              </div>
            </ScrollReveal>

            {/* Hero visual / mock */}
            <ScrollReveal delay={0.4}>
              <div className="mt-12 relative mx-auto max-w-4xl">
                <div className="relative rounded-2xl border border-white/[0.08] bg-card/30 backdrop-blur-xl p-2 shadow-2xl shadow-purple-500/10">
                  <div className="aspect-video rounded-xl bg-gradient-to-br from-purple-900/40 via-background to-cyan-900/40 flex items-center justify-center relative overflow-hidden">
                    {/* Mock UI inside the hero visual */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center space-y-4">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center animate-pulse">
                          <Video className="h-8 w-8 text-white" />
                        </div>
                        <p className="text-sm text-muted-foreground">Your AI-generated video preview</p>
                      </div>
                    </div>
                    {/* Grid overlay */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
                  </div>
                </div>
                {/* Glow behind */}
                <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 rounded-3xl blur-2xl -z-10" />
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* Stats Section */}
        <section className="relative py-16 px-4 sm:px-6 lg:px-8 border-y border-white/[0.06] bg-white/[0.02]">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
              {stats.map((stat) => (
                <ScrollReveal key={stat.label}>
                  <div className="text-center space-y-2">
                    <stat.icon className="h-6 w-6 text-primary mx-auto mb-2" />
                    <div className="font-display text-3xl sm:text-4xl font-bold">
                      <AnimatedCounter end={stat.value} suffix={stat.suffix} decimals={stat.decimals ?? 0} />
                    </div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <ScrollReveal>
              <div className="text-center mb-16 space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1.5 text-xs uppercase tracking-widest text-purple-400">
                  <Zap className="h-3.5 w-3.5" />
                  Features
                </div>
                <h2 className="font-display text-4xl sm:text-5xl font-bold">
                  Everything you need to{" "}
                  <GradientText>go viral</GradientText>
                </h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                  From script to finished video — all powered by AI. No downloads, no complex software.
                </p>
              </div>
            </ScrollReveal>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f, i) => (
                <ScrollReveal key={f.title} delay={i * 0.08}>
                  <CinematicCard glowColor={f.color} className="h-full">
                    <div className="p-6 space-y-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${f.color}15` }}
                      >
                        <f.icon className="h-6 w-6" style={{ color: f.color }} />
                      </div>
                      <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                    </div>
                  </CinematicCard>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it Works */}
        <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8 border-y border-white/[0.06]">
          <div className="mx-auto max-w-5xl">
            <ScrollReveal>
              <div className="text-center mb-16 space-y-4">
                <h2 className="font-display text-4xl sm:text-5xl font-bold">
                  From idea to video in{" "}
                  <GradientText>3 steps</GradientText>
                </h2>
              </div>
            </ScrollReveal>

            <div className="grid md:grid-cols-3 gap-8 relative">
              {/* Connector line */}
              <div className="hidden md:block absolute top-16 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-cyan-500/30 via-purple-500/30 to-pink-500/30" />

              {steps.map((step, i) => (
                <ScrollReveal key={step.num} delay={i * 0.15}>
                  <div className="text-center space-y-4 relative">
                    <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm relative z-10">
                      {step.num}
                    </div>
                    <h3 className="font-display text-xl font-semibold">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <ScrollReveal>
              <div className="text-center mb-12 space-y-4">
                <h2 className="font-display text-4xl sm:text-5xl font-bold">
                  Simple{" "}
                  <GradientText>pricing</GradientText>
                </h2>
                <p className="text-muted-foreground">Start free. Upgrade when you&apos;re ready.</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <PricingTable />
            </ScrollReveal>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-cyan-500/5" />
          <div className="mx-auto max-w-3xl text-center relative space-y-8">
            <ScrollReveal>
              <h2 className="font-display text-4xl sm:text-5xl font-bold">
                Ready to create your first{" "}
                <GradientText>viral video?</GradientText>
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <p className="text-lg text-muted-foreground">
                Join 500+ creators using ViralTrim to produce content that gets views.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <GlowButton size="lg" href="/register">
                Get started for free <ArrowRight className="h-5 w-5" />
              </GlowButton>
            </ScrollReveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-12 px-4 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <span className="font-display font-bold">viraltrim</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} viraltrim · Coded Motion Studio
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link to="/register" className="hover:text-foreground transition-colors">Sign up</Link>
            <a href="https://codedmotion.studio" className="hover:text-foreground transition-colors" target="_blank" rel="noreferrer">
              Agency
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
