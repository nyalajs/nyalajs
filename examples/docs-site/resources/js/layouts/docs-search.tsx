import { useEffect, useRef, useState } from "react";
import { router } from "@nyalajs/inertia/client";
import { FileText, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchResult {
    slug: string;
    title: string;
    group: string;
    excerpt: string;
}

interface DocsSearchProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Real search — every keystroke (debounced) hits GET /api/search on the
 * backend, which filters DocsService's index built from the actual
 * website/docs/*.md files. No client-side search index shipped to the
 * browser.
 */
export function DocsSearch({ open, onOpenChange }: DocsSearchProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        if (open) {
            setQuery("");
            setResults([]);
            setActiveIndex(0);
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [open]);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        if (!query.trim()) {
            setResults([]);
            return;
        }
        setLoading(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                setResults(data.results ?? []);
                setActiveIndex(0);
            } finally {
                setLoading(false);
            }
        }, 200);
        return () => clearTimeout(debounceRef.current);
    }, [query]);

    function go(slug: string) {
        onOpenChange(false);
        router.visit(`/docs/${slug}`);
    }

    function onKeyDown(e: React.KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && results[activeIndex]) {
            e.preventDefault();
            go(results[activeIndex].slug);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl gap-0 overflow-hidden p-0" onKeyDown={onKeyDown}>
                <DialogTitle className="sr-only">Search documentation</DialogTitle>
                <div className="flex items-center gap-2 border-b px-4">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search documentation..."
                        className="border-0 shadow-none focus-visible:ring-0"
                    />
                    {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                </div>

                <div className="max-h-96 overflow-y-auto p-2">
                    {results.length === 0 && query.trim() && !loading && (
                        <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                            No results for "{query}"
                        </p>
                    )}
                    {results.length === 0 && !query.trim() && (
                        <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                            Type to search the docs...
                        </p>
                    )}
                    {results.map((result, i) => (
                        <button
                            key={result.slug}
                            onClick={() => go(result.slug)}
                            onMouseEnter={() => setActiveIndex(i)}
                            className={cn(
                                "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left",
                                i === activeIndex ? "bg-accent" : ""
                            )}
                        >
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{result.title}</span>
                                    <span className="text-xs text-muted-foreground">{result.group}</span>
                                </div>
                                {result.excerpt && (
                                    <p className="truncate text-xs text-muted-foreground">{result.excerpt}</p>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
