import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactPlayer from 'react-player';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Scissors, 
  Sparkles, 
  Play, 
  Loader2, 
  TrendingUp, 
  ArrowRight,
  Video,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { api, type ClipSuggestion } from '@/lib/api-client';
import { toast } from 'sonner';
export default function EditorPage() {
  const params = useParams();
  const videoId = params.videoId ? String(params.videoId) : null;
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [suggestions, setSuggestions] = useState<ClipSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!videoId) {
      toast.error('Project identifier missing');
      navigate('/discovery');
    }
  }, [videoId, navigate]);
  const fetchSuggestions = useCallback(async () => {
    if (!videoId) return;
    try {