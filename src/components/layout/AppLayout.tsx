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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type AppLayoutProps = {
  children: React.ReactNode;
  container?: boolean;
  className?: string;
  contentClassName?: string;
};

const MAIN_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "My Videos", icon: Video, path: "/videos" },
  { label: "Discovery", icon: TrendingUp, path: "/discovery" },
  { label: "Schedule", icon: Calendar, path: "/schedule" },
] as const;

const ACCOUNT_NAV = [
  { label: "Billing", icon: CreditCard, path: "/billing" },
  { label: "Affiliate", icon: Users, path: "/affiliate" },
  { label: "Settings", icon: Settings, path: "/settings" },
] as const;

function isPathActive(pathname: string, path: string): boolean {
  if (path === "/editor/new") {
    return pathname.startsWith("/editor");
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function AppLayout({
  children,
  container = false,
  className,
  contentClassName,
}: AppLayoutProps): React.ReactElement {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const renderNavLink = (item: (typeof MAIN_NAV)[number] | (typeof ACCOUNT_NAV)[number]) => {
    const Icon = item.icon;
    const active = isPathActive(location.pathname, item.path);
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-primary/15 text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {item.label}
      </Link>
    );
  };

  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-3 px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 font-bold tracking-tight"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </span>
            <span className="hidden font-display text-sm uppercase sm:inline">ViralTrim</span>
          </button>

          <nav className="ml-2 hidden flex-1 items-center gap-1 md:flex">
            {MAIN_NAV.map(renderNavLink)}
            <span className="mx-2 h-4 w-px bg-border" aria-hidden />
            {ACCOUNT_NAV.map(renderNavLink)}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => {
                navigate("/");
                void logout().catch(() => undefined);
              }}
            >
              <LogOut className="mr-1 h-4 w-4" />
              Sign out
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="sm:hidden"
              onClick={() => {
                navigate("/");
                void logout().catch(() => undefined);
              }}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-t border-border px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              <p className="px-3 text-xs font-semibold uppercase text-muted-foreground">Main</p>
              {MAIN_NAV.map(renderNavLink)}
              <p className="mt-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
                Account
              </p>
              {ACCOUNT_NAV.map(renderNavLink)}
            </div>
          </div>
        ) : null}
      </header>

      {container ? (
        <div
          className={cn(
            "mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10 lg:px-8 lg:py-12",
            contentClassName
          )}
        >
          {children}
        </div>
      ) : (
        <div className={cn(contentClassName)}>{children}</div>
      )}
    </div>
  );
}
