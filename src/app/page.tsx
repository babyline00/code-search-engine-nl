"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, ExternalLink, Sparkles, Loader2, Code2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  SUPPORTED_LANGUAGES,
  languageLabel,
} from "@/lib/language-detect";

interface RepoInfo {
  id: string;
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  description: string | null;
  files: number;
  chunks: number;
}

interface SearchHit {
  chunkId: string;
  repo: {
    id: string;
    owner: string;
    name: string;
    url: string;
    defaultBranch: string;
  };
  filePath: string;
  language: string;
  symbolName: string | null;
  startLine: number;
  endLine: number;
  content: string;
  githubUrl: string;
  scores: { bm25: number; vector: number; fused: number };
}

interface Stats {
  repos: number;
  files: number;
  chunks: number;
  explanations: number;
  searchCount: number;
  languages: { language: string; count: number }[];
}

interface ExplainState {
  loading: boolean;
  text: string | null;
  error: string | null;
  cached?: boolean;
}

const LANG_FILTERS = SUPPORTED_LANGUAGES.filter((l) => l !== "unknown");

export default function Home() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filterLanguages, setFilterLanguages] = useState<string[]>([]);
  const [filterRepoIds, setFilterRepoIds] = useState<string[]>([]);
  const [explain, setExplain] = useState<Record<string, ExplainState>>({});

  // initial load — repos + stats (auto-seeded by the API)
  useEffect(() => {
    fetch("/api/repos")
      .then((r) => r.json())
      .then((d) => setRepos(d.repos ?? []))
      .catch(() => {});
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);

  const doSearch = useCallback(
    async (q: string, langs: string[], repoIds: string[]) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setLoading(true);
      setError(null);
      setSubmittedQuery(trimmed);
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            filterLanguages: langs.length ? langs : undefined,
            filterRepoIds: repoIds.length ? repoIds : undefined,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch (e) {
        setError((e as Error).message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // re-run search when filters change (only if user already searched once)
  useEffect(() => {
    if (submittedQuery) {
      doSearch(submittedQuery, filterLanguages, filterRepoIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterLanguages, filterRepoIds]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query, filterLanguages, filterRepoIds);
  };

  const toggleLanguage = (lang: string) => {
    setFilterLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  };

  const toggleRepo = (id: string) => {
    setFilterRepoIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const explainChunk = async (chunkId: string) => {
    // If already loaded, just toggle (no re-fetch)
    if (explain[chunkId]?.text) {
      setExplain((p) => ({ ...p, [chunkId]: { ...p[chunkId] } }));
      return;
    }
    setExplain((p) => ({
      ...p,
      [chunkId]: { loading: true, text: null, error: null },
    }));
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkId, query: submittedQuery || query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExplain((p) => ({
        ...p,
        [chunkId]: {
          loading: false,
          text: data.explanation,
          error: null,
          cached: !!data.cached,
        },
      }));
    } catch (e) {
      setExplain((p) => ({
        ...p,
        [chunkId]: { loading: false, text: null, error: (e as Error).message },
      }));
      toast.error("Could not fetch explanation");
    }
  };

  const langCounts = useMemo(() => {
    const m = new Map<string, number>();
    (stats?.languages ?? []).forEach((l) => m.set(l.language, l.count));
    return m;
  }, [stats]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="size-6 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight">
              Code Search Engine{" "}
              <span className="text-muted-foreground font-normal">(NL)</span>
            </h1>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <span>{stats?.repos ?? 0} repos</span>
            <span>{stats?.files ?? 0} files</span>
            <span>{stats?.chunks ?? 0} chunks</span>
            <span>{stats?.searchCount ?? 0} searches</span>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 w-full max-w-4xl">
        {/* Hero search */}
        <section className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            Search code in natural language
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base mb-5">
            Hybrid BM25 + vector retrieval across pre-indexed public GitHub
            repos. Ask for what the code <em>does</em>, not just keywords.
          </p>
          <form onSubmit={onSubmit} className="flex gap-2 max-w-2xl mx-auto">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. how does zustand persist state to localStorage"
              className="h-11 text-base"
              aria-label="Search query"
            />
            <Button type="submit" size="lg" disabled={loading} className="h-11">
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Search
            </Button>
          </form>
        </section>

        {/* Filters */}
        <section className="mb-6 space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Language
            </div>
            <div className="flex flex-wrap gap-2">
              {LANG_FILTERS.map((lang) => {
                const active = filterLanguages.includes(lang);
                const count = langCounts.get(lang) ?? 0;
                return (
                  <Badge
                    key={lang}
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer select-none"
                    onClick={() => toggleLanguage(lang)}
                  >
                    {languageLabel(lang as any)}
                    {count > 0 && (
                      <span className="ml-1 text-[10px] opacity-70">
                        {count}
                      </span>
                    )}
                  </Badge>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Repo
            </div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {repos.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Loading repos…
                </span>
              )}
              {repos.map((r) => {
                const active = filterRepoIds.includes(r.id);
                return (
                  <Badge
                    key={r.id}
                    variant={active ? "default" : "secondary"}
                    className="cursor-pointer select-none"
                    onClick={() => toggleRepo(r.id)}
                  >
                    {r.owner}/{r.name}
                  </Badge>
                );
              })}
            </div>
          </div>
          {(filterLanguages.length > 0 || filterRepoIds.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterLanguages([]);
                setFilterRepoIds([]);
              }}
            >
              Clear filters
            </Button>
          )}
        </section>

        <Separator className="mb-6" />

        {/* Results */}
        <section>
          {loading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin mr-2" /> Searching…
            </div>
          )}
          {!loading && error && (
            <div className="text-center py-16 text-destructive">
              Search failed: {error}
            </div>
          )}
          {!loading && !error && submittedQuery && results.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              No snippets matched{" "}
              <span className="font-medium text-foreground">
                &ldquo;{submittedQuery}&rdquo;
              </span>
              . Try a different phrasing or clear filters.
            </div>
          )}
          {!loading && !error && !submittedQuery && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Try a query like &ldquo;useState hook&rdquo;, &ldquo;express
              middleware&rdquo;, or &ldquo;jwt token signing&rdquo;.
            </div>
          )}
          <div className="space-y-4">
            {results.map((hit) => (
              <SnippetCard
                key={hit.chunkId}
                hit={hit}
                explainState={explain[hit.chunkId]}
                onExplain={() => explainChunk(hit.chunkId)}
              />
            ))}
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t bg-card/40">
        <div className="container mx-auto px-4 py-4 text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Code Search Engine (NL)</span>
          <span>Hybrid retrieval · BM25 + hashing-vector · Prisma + SQLite</span>
          <span className="ml-auto">
            Pre-indexed {stats?.repos ?? 0} repos · {stats?.chunks ?? 0} chunks
          </span>
        </div>
      </footer>
    </div>
  );
}

function SnippetCard({
  hit,
  explainState,
  onExplain,
}: {
  hit: SearchHit;
  explainState?: ExplainState;
  onExplain: () => void;
}) {
  const lines = useMemo(() => hit.content.split("\n"), [hit.content]);
  const gutterWidth = String(hit.startLine + lines.length).length;
  return (
    <Card className="overflow-hidden p-0">
      {/* Card header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 border-b bg-muted/30">
        <a
          href={hit.repo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-sm hover:underline"
        >
          {hit.repo.owner}/{hit.repo.name}
        </a>
        <span className="text-muted-foreground text-sm">·</span>
        <span className="font-mono text-xs text-foreground/80 truncate max-w-[60%]">
          {hit.filePath}
        </span>
        <span className="text-muted-foreground text-xs ml-auto whitespace-nowrap">
          L{hit.startLine}–L{hit.endLine}
          {hit.symbolName ? ` · ${hit.symbolName}` : ""}
        </span>
      </div>

      {/* Code block */}
      <div className="overflow-x-auto max-h-96 overflow-y-auto text-xs">
        <pre className="font-mono leading-relaxed p-3 min-w-max">
          <code>
            {lines.map((line, i) => {
              const ln = hit.startLine + i;
              return (
                <span key={i} className="block">
                  <span className="inline-block w-10 pr-3 text-right text-muted-foreground/60 select-none tabular-nums">
                    {String(ln).padStart(gutterWidth, " ")}
                  </span>
                  <span className="whitespace-pre">{line || " "}</span>
                </span>
              );
            })}
          </code>
        </pre>
      </div>

      {/* Card footer */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t bg-muted/20">
        <Button asChild variant="outline" size="sm">
          <a
            href={hit.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="size-3.5" />
            Open on GitHub
          </a>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onExplain}
          disabled={explainState?.loading}
        >
          {explainState?.loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Explain this snippet
        </Button>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
          <Badge variant="outline" className="font-mono text-[10px]">
            {hit.language}
          </Badge>
          <span title="BM25 / vector / fused scores">
            f={hit.scores.fused} · bm25={hit.scores.bm25} · vec={hit.scores.vector}
          </span>
        </div>
      </div>

      {/* Inline explanation panel */}
      {explainState && (explainState.loading || explainState.text || explainState.error) && (
        <div className="px-4 py-3 border-t bg-primary/5">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="size-3.5 text-primary" />
            <span className="text-xs font-medium">
              AI explanation
              {explainState.cached && (
                <span className="ml-1 text-muted-foreground">(cached)</span>
              )}
            </span>
          </div>
          {explainState.loading && (
            <div className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin mr-2" /> Generating…
            </div>
          )}
          {explainState.error && (
            <div className="text-sm text-destructive">
              Failed: {explainState.error}
            </div>
          )}
          {explainState.text && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {explainState.text}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
