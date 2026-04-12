import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PricingTable } from '@/components/pricing-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CreditCard, Zap, ShieldCheck } from 'lucide-react';
import { useSubscription } from '@/hooks/use-subscription';
export default function BillingPage() {
  const { isSubscribed, subscription, openPortal } = useSubscription();
  return (
    <AppLayout container contentClassName="space-y-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-display font-extrabold tracking-tight">Billing & Subscription</h1>
        <p className="text-lg text-muted-foreground">Manage your plan, billing history, and usage quotas.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-10">
          <Card className="border-border/50 shadow-soft">
            <CardHeader>
              <CardTitle className="text-xl">Usage Limits</CardTitle>
              <CardDescription>Your current quota for this billing cycle.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-10 py-6">
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="block text-sm font-bold uppercase tracking-wider">AI Generation Credits</span>
                    <span className="text-xs text-muted-foreground">Used for viral clipping and captioning</span>
                  </div>
                  <span className="text-sm font-mono font-bold text-primary">3 / 50 <span className="text-muted-foreground font-medium">clips</span></span>
                </div>
                <Progress value={6} className="h-2.5" />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="block text-sm font-bold uppercase tracking-wider">Connected Accounts</span>
                    <span className="text-xs text-muted-foreground">TikTok, Instagram, and YouTube channels</span>
                  </div>
                  <span className="text-sm font-mono font-bold text-primary">1 / 5 <span className="text-muted-foreground font-medium">profiles</span></span>
                </div>
                <Progress value={20} className="h-2.5" />