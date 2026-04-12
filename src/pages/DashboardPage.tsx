import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Plus, Scissors, Zap, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { api, type UsageSummary } from '@/lib/api-client';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<any[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [activityRes, usageRes] = await Promise.all([
          api.getRecentActivity(),
          api.getUsage()
        ]);
        if (!isMounted) return;
        if (activityRes.success && activityRes.data) setActivity(activityRes.data);
        if (usageRes.success && usageRes.data) setUsage(usageRes.data);
      } catch (err) {
        console.error('Data sync failed', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, []);
  return (
    <AppLayout container contentClassName="space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-display font-extrabold tracking-tight uppercase">Producer Workspace</h1>
          <p className="text-muted-foreground font-medium">Welcome back, {user?.displayName?.split(' ')[0] || 'Operator'}. System status optimal.</p>