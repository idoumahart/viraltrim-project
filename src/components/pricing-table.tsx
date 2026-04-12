import React from "react";
import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatPrice } from "@/lib/utils";

const tiers = [
  {
    name: "Free",
    price: 0,
    currency: "USD",
    description: "Explore AI clipping and discovery.",
    features: ["3 AI clips / month", "TikTok 9:16", "Viral discovery", "Captions"],
    cta: "Get started",
    popular: false,
  },
  {
    name: "Pro",
    price: 2900,
    currency: "USD",
    description: "For serious creators.",
    features: ["50 clips / month", "All formats", "Scheduler", "Priority processing"],
    cta: "Upgrade to Pro",
    popular: true,
  },
  {
    name: "Agency",
    price: 9900,
    currency: "USD",
    description: "Teams and multi-brand workflows.",
    features: ["Unlimited clips", "Affiliate program", "Dedicated support", "API-ready worker"],
    cta: "Talk to us",
    popular: false,
  },
];

export function PricingTable() {
  const navigate = useNavigate();
  return (
    <div className="grid gap-6 md:grid-cols-3 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      {tiers.map((tier) => (
        <Card
          key={tier.name}
          className={cn(
            "relative border-border bg-card flex flex-col",
            tier.popular && "border-primary shadow-lg shadow-primary/10",
          )}
        >
          {tier.popular ? (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
              Most popular
            </Badge>
          ) : null}
          <CardHeader>
            <CardTitle className="font-display text-2xl">{tier.name}</CardTitle>
            <CardDescription>{tier.description}</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold font-display">
                {tier.price === 0 ? "$0" : formatPrice(tier.price, tier.currency.toLowerCase())}
              </span>
              {tier.price > 0 ? <span className="text-muted-foreground text-sm"> /mo</span> : null}
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-2 text-sm text-muted-foreground">
              {tier.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              className={cn("w-full", tier.popular && "btn-gradient")}
              variant={tier.popular ? "default" : "outline"}
              onClick={() => navigate(tier.price === 0 ? "/register" : "/billing")}
            >
              {tier.cta}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
