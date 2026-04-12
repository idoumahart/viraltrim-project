import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  Copy, 
  ExternalLink, 
  Gift,
  CheckCircle,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { api, type AffiliateStats } from '@/lib/api-client';
import { toast } from 'sonner';
export default function AffiliatePage() {
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.getAffiliateStats();
        if (res.success && res.data) setStats(res.data);
      } catch (err) {
        console.error('Affiliate sync error', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);
  const copyRefLink = () => {
    if (!stats) return;
    const link = `${window.location.origin}/register?ref=${stats.referralCode}`;
    navigator.clipboard.writeText(link);
    toast.success('Referral link copied to clipboard!');
  };
  if (loading) {
    return (