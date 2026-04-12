import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Play, Scissors, Search, Sparkles, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api, type ViralVideo } from "@/lib/api-client";
import { toast } from "sonner";

export default function DiscoveryPage() {
  const navigate = useNavigate();
  const [trends, setTrends] = useState<ViralVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e?: React.FormEvent, directQuery?: string) => {
    if (e) {
      e.preventDefault();
    }
    const query = directQuery || searchQuery;
    if (!query.trim()) {
      toast.error("Enter a topic to search");
      return;
    }
    if (directQuery) {
      setSearchQuery(directQuery);
    }
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await api.getViralDiscovery(query);
      if (res.success && res.data) {
        setTrends(res.data);
        if (res.data.length === 0) {
          toast.info("No direct matches found. Try broad keywords.");
        }
      } else {
        toast.error(res.error || "Discovery engine offline");
      }
    } catch {
      toast.error("Search failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout container contentClassName="space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-widest">Powered by Gemini</span>
        </div>
        <h1 className="text-3xl font-display font-bold">Viral discovery</h1>
        <p className="text-muted-foreground">Search topics; open a result in the studio to generate clips.</p>
      </div>

      <form onSubmit={(e) => void handleSearch(e)} className="flex gap-2 max-w-xl">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="e.g. fitness trends, AI news, street interviews…"
          className="flex-1"
        />
        <Button type="submit" disabled={loading} className="btn-gradient gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
      </form>

      {!hasSearched && !loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {["Breaking news", "Comedy skits", "Tech reviews"].map((q) => (
            <Button key={q} variant="outline" className="justify-start gap-2" onClick={() => void handleSearch(undefined, q)}>
              <TrendingUp className="h-4 w-4 text-primary" />
              {q}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)
          : trends.map((t) => (
              <Card key={t.id} className="overflow-hidden border-border/80 bg-card/80">
                <div
                  className="h-36 bg-cover bg-center"
                  style={{ backgroundImage: `url(${t.thumbnail})` }}
                />
                <CardHeader className="pb-2">
                  <CardTitle className="text-base line-clamp-2">{t.title}</CardTitle>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Badge variant="secondary">{t.views} views</Badge>
                    <Badge>{t.viralScore} score</Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground line-clamp-2">{t.url}</CardContent>
                <CardFooter className="flex gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <a href={t.url} target="_blank" rel="noreferrer">
                      <Play className="h-3 w-3 mr-1" />
                      Open
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    className="btn-gradient gap-1"
                    onClick={() => navigate(`/editor/${encodeURIComponent(t.id)}`, { state: { video: t } })}
                  >
                    <Scissors className="h-3 w-3" />
                    Studio
                  </Button>
                </CardFooter>
              </Card>
            ))}
      </div>
    </AppLayout>
  );
}
