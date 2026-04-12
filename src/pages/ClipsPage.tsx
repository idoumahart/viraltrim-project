import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Search,
  Scissors,
  MoreVertical,
  Play,
  Download,
  Share2,
  Filter,
  Eye,
  Trash2,
  MessageSquare,
  Loader2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger } from
"@/components/ui/dropdown-menu";
import { api, type Clip } from '@/lib/api-client';
import { toast } from 'sonner';
export default function ClipsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  useEffect(() => {
    const fetchClips = async () => {
      try {
        const res = await api.getClips();
        if (res.success && res.data) {
          setClips(res.data);
        } else {
          toast.error(res.error || 'Failed to load clip library');
        }