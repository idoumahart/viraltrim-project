import React, { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { AppLayout } from "@/components/layout/AppLayout";
import { GradientText } from "@/components/cinematic/GradientText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, AlertCircle, CheckCircle, Activity, Clock, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthCheck {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

interface HealthResponse {
  status: string;
  checks: Record<string, HealthCheck>;
  timestamp: string;
}

interface LogEntry {
  id: number;
  reqId: string | null;
  method: string | null;
  path: string | null;
  status: number | null;
  durationMs: number | null;
  ip: string | null;
  error: string | null;
  createdAt: string;
}

interface StatsResponse {
  periodHours: number;
  totalRequests: number;
  avgDurationMs: number;
  errorCount: number;
  errorRatePct: number;
  p95DurationMs: number;
  statusBreakdown: Array<{ status: number | null; count: number }>;
}

export function SreDashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState({ health: true, logs: true, stats: true });
  const [error, setError] = useState<string | null>(null);
  const [pathFilter, setPathFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchAll = React.useCallback(async () => {
    setLoading({ health: true, logs: true, stats: true });
    setError(null);
    try {
      const [h, l, s] = await Promise.all([
        api.sreHealth(),
        api.sreLogs(50, pathFilter, statusFilter),
        api.sreStats(24),
      ]);
      if (h.success && h.data) setHealth(h.data);
      if (l.success && l.data) setLogs(l.data.logs);
      if (s.success && s.data) setStats(s.data);
      if (!h.success || !l.success || !s.success) {
        setError("Some data failed to load. Check permissions.");
      }
    } catch {
      setError("Failed to load SRE data. Ensure you have admin access.");
    } finally {
      setLoading({ health: false, logs: false, stats: false });
    }
  }, [pathFilter, statusFilter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const statCard = (label: string, value: string | number, icon: React.ReactNode, color: string) => (
    <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.03]">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("p-1.5 rounded-lg", color)}>{icon}</div>
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold font-display">{value}</p>
    </div>
  );

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">
              <GradientText>SRE Dashboard</GradientText>
            </h1>
            <p className="text-muted-foreground mt-1">System health, request logs, and operational metrics.</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={Object.values(loading).some(Boolean)}>
            <RefreshCw className={cn("h-4 w-4 mr-1.5", Object.values(loading).some(Boolean) && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Health Checks */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Health Checks</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {loading.health ? (
              <div className="col-span-full flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : health ? (
              Object.entries(health.checks).map(([name, check]) => (
                <div key={name} className={cn("p-4 rounded-xl border flex items-center gap-3", check.ok ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5")}>
                  {check.ok ? <CheckCircle className="h-5 w-5 text-green-500 shrink-0" /> : <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />}
                  <div>
                    <p className="font-medium text-sm capitalize">{name}</p>
                    <p className="text-xs text-muted-foreground">{check.latencyMs}ms {check.error && <span className="text-red-400">· {check.error}</span>}</p>
                  </div>
                </div>
              ))
            ) : null}
          </div>
        </section>

        {/* Stats */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">24h Statistics</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {loading.stats ? (
              <div className="col-span-full flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : stats ? (
              <>
                {statCard("Requests", stats.totalRequests.toLocaleString(), <Activity className="h-4 w-4 text-blue-400" />, "bg-blue-500/10")}
                {statCard("Error Rate", `${stats.errorRatePct}%`, <AlertCircle className="h-4 w-4 text-red-400" />, "bg-red-500/10")}
                {statCard("Avg Latency", `${stats.avgDurationMs}ms`, <Clock className="h-4 w-4 text-yellow-400" />, "bg-yellow-500/10")}
                {statCard("P95 Latency", `${stats.p95DurationMs}ms`, <Shield className="h-4 w-4 text-green-400" />, "bg-green-500/10")}
              </>
            ) : null}
          </div>
        </section>

        {/* Request Logs */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Request Logs</h2>
            <div className="flex gap-2">
              <Input placeholder="Filter path..." value={pathFilter} onChange={(e) => setPathFilter(e.target.value)} className="h-8 w-40 text-xs" />
              <Input placeholder="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 w-20 text-xs" />
              <Button size="sm" variant="outline" onClick={() => fetchAll()}>Filter</Button>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Time</th>
                  <th className="text-left px-4 py-2">Method</th>
                  <th className="text-left px-4 py-2">Path</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Duration</th>
                  <th className="text-left px-4 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {loading.logs ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /></td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No logs yet</td></tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleTimeString()}</td>
                      <td className="px-4 py-2"><span className="text-xs font-medium px-1.5 py-0.5 rounded bg-muted">{log.method}</span></td>
                      <td className="px-4 py-2 text-xs truncate max-w-[200px]">{log.path}</td>
                      <td className="px-4 py-2">
                        <span className={cn("text-xs font-medium", log.status && log.status >= 500 ? "text-red-400" : log.status && log.status >= 400 ? "text-yellow-400" : "text-green-400")}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{log.durationMs}ms</td>
                      <td className="px-4 py-2 text-xs text-red-400 truncate max-w-[150px]">{log.error}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
