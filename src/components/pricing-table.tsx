import React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatPrice } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
const tiers = [
  {
    name: 'Free',
    price: 0,
    currency: 'USD',
    description: 'Perfect for exploring the power of AI clipping.',
    features: [
      '3 AI clips per month',
      'TikTok (9:16) format',
      'Standard AI captions',
      'Basic viral discovery',
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Creator',
    price: 2900,
    currency: 'USD',
    description: 'The sweet spot for serious content creators.',
    features: [
      '50 AI clips per month',
      'All platform formats',
      'Premium animated captions',
      'Auto-poster distribution',
      'Priority processing',
    ],
    cta: 'Upgrade to Creator',
    popular: true,
  },
  {
    name: 'Agency',
    price: 9900,
    currency: 'USD',
    description: 'Unleash the full potential for multiple accounts.',
    features: [