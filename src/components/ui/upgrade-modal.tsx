import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Crown, Rocket, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/use-subscription";
import { toast } from "sonner";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Which feature triggered this modal */
  feature: string;
  /** Optional more detailed description of why this is gated */
  reason?: string;
  /** Which plan is required: 'pro' | 'agency' */
  requiredPlan?: "pro" | "agency";
}

const PLAN_FEATURES = {
  free: {
    icon: Zap,
    label: "Free",
    color: "text-muted-foreground",
    items: ["3 AI clips / month", "30s / 60s / 90s clips", "1 saved edit per clip", "Clip library"],
  },
  pro: {
    icon: Rocket,
    label: "Pro",
    color: "text-blue-400",
    items: ["50 AI clips / month", "30s / 60s / 90s clips", "3 saved edits per clip", "Priority generation", "All Free features"],
  },
  agency: {
    icon: Crown,
    label: "Agency",
    color: "text-primary",
    items: [
      "Unlimited AI clips",
      "3 min / 5 min / 10 min clips",
      "10 saved edits per clip",
      "Save all 3 clips at once",
      "Background AI generation",
      "All Pro features",
    ],
  },
};

export function UpgradeModal({ open, onClose, feature, reason, requiredPlan = "agency" }: UpgradeModalProps) {
  const { prices, createCheckout } = useSubscription();
  const [loading, setLoading] = React.useState(false);

  const handleUpgrade = async (priceId: string) => {
    setLoading(true);
    try {
      const url = await createCheckout(priceId);
      if (url) {
        window.location.href = url;
      }
    } catch {
      toast.error("Could not start checkout. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const proPrice = prices.find((p) =>
    p.product?.name?.toLowerCase().includes("pro") ||
    p.product?.name?.toLowerCase().includes("starter")
  );
  const agencyPrice = prices.find((p) =>
    p.product?.name?.toLowerCase().includes("agency") ||
    p.product?.name?.toLowerCase().includes("unlimited")
  );

  const formatPrice = (p: typeof prices[number]) => {
    if (!p.unitAmount) return "Contact us";
    return `$${(p.unitAmount / 100).toFixed(0)}/${p.recurring?.interval ?? "mo"}`;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-2xl bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header gradient */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500" />

            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="p-6 space-y-6">
              {/* Feature locked */}
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Crown className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-display font-bold">
                    Unlock <span className="text-primary">{feature}</span>
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {reason ??
                      `This feature requires the ${requiredPlan === "agency" ? "Agency" : "Pro"} plan. Upgrade to access it instantly.`}
                  </p>
                </div>
              </div>

              {/* Plan comparison */}
              <div className="grid grid-cols-3 gap-3">
                {(["free", "pro", "agency"] as const).map((plan) => {
                  const info = PLAN_FEATURES[plan];
                  const Icon = info.icon;
                  const isRequired = plan === requiredPlan || (requiredPlan === "pro" && plan === "pro") || (requiredPlan === "agency" && plan === "agency");
                  const isHighlighted = isRequired;

                  return (
                    <div
                      key={plan}
                      className={`rounded-xl border p-4 space-y-3 transition-colors ${
                        isHighlighted
                          ? "border-primary/60 bg-primary/5"
                          : "border-border/50 bg-card/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`flex items-center gap-1.5 font-semibold text-sm ${info.color}`}>
                          <Icon className="h-4 w-4" />
                          {info.label}
                        </div>
                        {isHighlighted && (
                          <Badge className="text-xs bg-primary text-primary-foreground">Required</Badge>
                        )}
                      </div>
                      <ul className="space-y-1.5">
                        {info.items.map((item) => (
                          <li key={item} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Check className="h-3 w-3 mt-0.5 shrink-0 text-green-500" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3">
                {requiredPlan === "pro" && proPrice && (
                  <Button
                    className="flex-1 btn-gradient gap-2"
                    disabled={loading}
                    onClick={() => void handleUpgrade(proPrice.id)}
                  >
                    <Rocket className="h-4 w-4" />
                    Upgrade to Pro · {formatPrice(proPrice)}
                  </Button>
                )}
                {agencyPrice && (
                  <Button
                    className={`flex-1 gap-2 ${requiredPlan === "agency" ? "btn-gradient" : ""}`}
                    variant={requiredPlan === "agency" ? "default" : "outline"}
                    disabled={loading}
                    onClick={() => void handleUpgrade(agencyPrice.id)}
                  >
                    <Crown className="h-4 w-4" />
                    Upgrade to Agency · {formatPrice(agencyPrice)}
                  </Button>
                )}
                {!proPrice && !agencyPrice && (
                  <Button
                    className="flex-1 btn-gradient gap-2"
                    onClick={() => { window.location.href = "/billing"; }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    View pricing plans
                  </Button>
                )}
                <Button variant="ghost" onClick={onClose} className="sm:w-auto">
                  Maybe later
                </Button>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                Secure checkout via Stripe · Cancel anytime ·{" "}
                <a href="/billing" className="underline hover:text-foreground">
                  See all plan details
                </a>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
