import React from "react";
import { 
  TrendingUp, Scissors, Calendar, Settings, Sparkles, 
  LayoutDashboard, CreditCard, LogOut, Video, Users 
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, 
  SidebarHeader, SidebarSeparator, SidebarMenu, 
  SidebarMenuItem, SidebarMenuButton, SidebarGroupLabel 
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
export function AppSidebar(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const menuItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Discovery', icon: TrendingUp, path: '/discovery' },
    { label: 'Studio', icon: Video, path: '/editor' },
    { label: 'Library', icon: Scissors, path: '/clips' },
    { label: 'Schedule', icon: Calendar, path: '/schedule' }
  ];
  const accountItems = [
    { label: 'Billing', icon: CreditCard, path: '/billing' },
    { label: 'Affiliate', icon: Users, path: '/affiliate' },
    { label: 'Settings', icon: Settings, path: '/settings' }
  ];
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  return (
    <Sidebar className="border-r border-border bg-background">
      <SidebarHeader className="h-20 flex justify-center px-6">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-base tracking-tighter uppercase">ViralTrim</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-4">
        <SidebarGroup>