import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, TrendingUp, Scissors, Zap, Share2, Play, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PricingTable } from '@/components/pricing-table';
function Hero3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationFrameId: number;
    let particles: { x: number; y: number; z: number; size: number; color: string }[] = [];
    const particleCount = 80;
    const resize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    const init = () => {
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: (Math.random() - 0.5) * 1500,
          y: (Math.random() - 0.5) * 1500,
          z: Math.random() * 2000,
          size: Math.random() * 1.5 + 0.5,
          color: i % 2 === 0 ? ' #3b82f6' : ' #6366f1'
        });
      }
    };
    const draw = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const fov = 1000;
      particles.forEach(p => {
        p.z -= 1.2;
        if (p.z <= 0) p.z = 2000;
        const scale = fov / (fov + p.z);