import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const TIERS = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "agency", label: "Agency" },
] as const;

/**
 * Owner-only dev tool: temporarily override the active plan for testing.
 * Visible ONLY when user.isOwner === true (set in D1 via migration SQL).
 * Override is stored in sessionStorage and reset on logout.
 * No owner emails are hardcoded anywhere in this bundle.
 */
export function TierSwitcher() {
  const { effectivePlan, setDevPlan, user } = useAuth();

  if (!user?.isOwner) return null;

  return (
    <div className="mx-3 mb-3 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 mb-1.5 px-0.5">
        Dev · Tier Override
      </p>
      <div className="flex gap-1">
        {TIERS.map((t) => (
          <button
            key={t.value}
            onClick={() => setDevPlan(effectivePlan === t.value ? null : t.value)}
            className={cn(
              "flex-1 rounded text-[11px] font-semibold py-1 transition-all",
              effectivePlan === t.value
                ? "bg-amber-500 text-black"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {effectivePlan !== user.plan && (
        <button
          onClick={() => setDevPlan(null)}
          className="mt-1.5 w-full text-[10px] text-amber-400/60 hover:text-amber-400 transition-colors text-center"
        >
          Reset to actual plan ({user.plan})
        </button>
      )}
    </div>
  );
}
