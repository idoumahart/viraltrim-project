import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useAuth, AuthProvider } from '@/hooks/use-auth';
import { useSubscription, SubscriptionProvider } from '@/hooks/use-subscription';
import { formatPrice, getIntervalLabel } from '@/lib/utils';
import { CreditCard, User, Key, Check, AlertCircle, Loader2, Sparkles, Receipt } from 'lucide-react';
export const HAS_TEMPLATE_DEMO = true;
function AuthDemo() {
    const { user, loading, error, login, register, logout, clearError } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLogin) {
            await login(email, password);
        } else {
            await register(email, password, displayName);
        }
    };
    if (user) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" /> Logged In
                    </CardTitle>
                    <CardDescription>Welcome back, {user.displayName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-sm space-y-1">
                        <p><strong>Email:</strong> {user.email}</p>
                        {user.stripeCustomerId && (
                            <p className="text-muted-foreground truncate">
                                <strong>Stripe ID:</strong> {user.stripeCustomerId}
                            </p>
                        )}
                    </div>