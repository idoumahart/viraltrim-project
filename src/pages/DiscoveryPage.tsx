import React, { useState } from 'react';
import ReactPlayer from 'react-player';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Play, Scissors, Search, Sparkles, Loader2, PlayCircle, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api, type ViralVideo } from '@/lib/api-client';
import { toast } from 'sonner';
export default function DiscoveryPage() {
  const navigate = useNavigate();
  const [trends, setTrends] = useState<ViralVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const handleSearch = async (e?: React.FormEvent, directQuery?: string) => {
    if (e) e.preventDefault();
    const query = directQuery || searchQuery;
    if (!query.trim()) {
      toast.error('Enter a topic to search');
      return;
    }
    if (directQuery) {
        setSearchQuery(directQuery);
    }
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await api.getViralDiscovery(query);
      if (res.success && res.data) {
        setTrends(res.data);
        if (res.data.length === 0) {
          toast.info('No direct matches found. Try broad keywords.');
        }
      } else {
        toast.error(res.error || 'Discovery engine offline');
      }
    } catch (err) {
      toast.error('Search failed. Check your connection.');