import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Video, 
  Share2, 
  Play, 
  Clock, 
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, type ScheduledPost } from '@/lib/api-client';
import { toast } from 'sonner';
export default function SchedulePage() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchSchedule = async () => {
      const res = await api.getScheduledPosts();
      if (res.success && res.data) {
        setPosts(res.data);
      } else {
        toast.error(res.error || 'Failed to sync schedule');
      }
      setLoading(false);
    };
    fetchSchedule();
  }, []);
  return (
    <AppLayout container contentClassName="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Content Schedule</h1>
          <p className="text-muted-foreground">Manage your cross-platform distribution pipeline.</p>
        </div>
        <Button className="btn-gradient shadow-primary">
          <Plus className="mr-2 h-4 w-4" /> Schedule Post
        </Button>