import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Calendar,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Scissors,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  X,
  ChevronDown,
  Film,
  FolderOpen
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { TierSwitcher } from "@/components/ui/TierSwitcher";
import { ChatbotWidget } from "@/components/ui/ChatbotWidget";
import { TipsTour } from "@/components/ui/TipsTour";


type AppLayoutProps = {
  children: React.ReactNode;
  container?: boolean;
  className?: string;
  contentClassName?: string;
};

const MAIN_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Viral Search", icon: TrendingUp, path: "/discovery" },

  { label: "Schedule", icon: Calendar, path: "/schedule" },
] as const;

const STUDIO_NAV = [
  { label: "My Videos", icon: FolderOpen, path: "/studio/videos" },
  { label: "Editor", icon: Scissors, path: "/studio/editor" },
  { label: "My Clips", icon: Film, path: "/studio/clips" },
] as const;

const ACCOUNT_NAV = [
  { label: "Billing", icon: CreditCard, path: "/billing" },
  { label: "Affiliate", icon: Users, path: "/affiliate" },
  { label: "Settings", icon: Settings, path: "/settings" },
] as const;

function isPathActive(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function AppLayout({
  children,
  container = false,
  className,
  contentClassName,
}: AppLayoutProps): React.ReactElement {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [studioExpanded, setStudioExpanded] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    navigate("/");
    try {
      await logout();
    } catch (e) {
      // ignore
    }
  };

  const renderSingleLink = (item: { label: string; icon: React.ElementType; path: string }, isSub?: boolean) => {
    const Icon = item.icon;
    const active = isPathActive(location.pathname, item.path);
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
          isSub ? "ml-4" : "",
          active
            ? "bg-primary/10 text-primary border border-primary/20"
            : "text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent"
        )}
      >
        <Icon className={cn("shrink-0", isSub ? "h-4 w-4" : "h-5 w-5")} />
        {item.label}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col p-4 w-full">
      <div className="flex items-center gap-2 px-2 pb-6 pt-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </span>
        <span className="font-display font-bold tracking-tight text-lg uppercase bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          ViralTrim
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 scrollbar-hide py-2">
        {/* Main Section */}
        <div className="space-y-1">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Platform</p>
          {MAIN_NAV.map((i) => renderSingleLink(i))}
        </div>

        {/* My Studio Section */}
        <div className="space-y-1">
          <button 
            onClick={() => setStudioExpanded(!studioExpanded)}
            className="w-full flex items-center justify-between px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-2"><Video className="w-4 h-4"/> My Studio</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", !studioExpanded && "-rotate-90")} />
          </button>
          
          <div className={cn("overflow-hidden transition-all duration-300 space-y-1", studioExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0")}>
            {STUDIO_NAV.map((i) => renderSingleLink(i, true))}
          </div>
        </div>

        {/* Account Section */}
        <div className="space-y-1">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Account</p>
          {ACCOUNT_NAV.map((i) => renderSingleLink(i))}
        </div>
      </div>

      <div className="mt-auto pt-4 pb-2 space-y-3">
        <TipsTour />
        <TierSwitcher />
        <Button
          variant="outline"
          className="w-full justify-start gap-3 border-border/50 text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 transition-all font-medium py-6"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </Button>
      </div>

    </div>
  );

  return (
    <div className={cn("min-h-screen bg-background flex", className)}>
      {/* Desktop Sidebar — z-[60] ensures it renders above Radix Dialog overlays (z-50) */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 left-0 border-r border-border/50 bg-card/30 backdrop-blur-xl z-[60]">
        <SidebarContent />
      </aside>

      {/* Mobile Header (Only visible on small screens) */}
      <header className="md:hidden fixed top-0 w-full z-40 border-b border-border bg-background/95 backdrop-blur h-14 flex items-center justify-between px-4">
        <button
          className="flex items-center gap-2 font-bold tracking-tight text-lg uppercase"
          onClick={() => navigate("/dashboard")}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
          </span>
          ViralTrim
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 max-w-[80%] bg-card border-r border-border h-full shadow-2xl animate-in slide-in-from-left">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className={cn(
        "flex-1 flex flex-col min-h-screen transition-all md:pl-64",
        "pt-14 md:pt-0" // Add top padding on mobile for the fixed header
      )}>
        {container ? (
          <div className={cn("mx-auto max-w-7xl w-full p-4 sm:p-6 md:p-8 lg:p-10", contentClassName)}>
            {children}
          </div>
        ) : (
          <div className={cn("flex-1", contentClassName)}>{children}</div>
        )}
      </main>

      {/* Global Widgets */}
      <ChatbotWidget />
    </div>
  );
}
