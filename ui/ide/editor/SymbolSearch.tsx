import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  FileCode,
  Box,
  Braces,
  CircleDot,
  Cpu,
  Hash,
  Variable,
  Code,
  Search,
  Layers,
} from "lucide-react";
import type { LspClient } from "./lsp-client";

// ── LSP symbol kinds ───────────────────────────────────────────────────────

const KIND_LABELS: Record<number, string> = {
  1: "file",
  2: "module",
  3: "namespace",
  4: "package",
  5: "class",
  6: "method",
  7: "property",
  8: "field",
  9: "constructor",
  10: "enum",
  11: "interface",
  12: "function",
  13: "variable",
  14: "constant",
  15: "string",
  16: "number",
  17: "boolean",
  18: "array",
  19: "object",
  20: "key",
  21: "null",
  22: "enum member",
  23: "struct",
  24: "event",
  25: "operator",
  26: "type param",
};

function KindIcon({ kind }: { kind: number }) {
  const cls = "symbol-search__kind-icon";
  switch (kind) {
    case 5:
      return <Box size={13} className={`${cls} ${cls}--class`} />;
    case 6:
      return <Code size={13} className={`${cls} ${cls}--method`} />;
    case 9:
      return <Code size={13} className={`${cls} ${cls}--constructor`} />;
    case 11:
      return <Layers size={13} className={`${cls} ${cls}--interface`} />;
    case 12:
      return <Cpu size={13} className={`${cls} ${cls}--function`} />;
    case 13:
      return <Variable size={13} className={`${cls} ${cls}--variable`} />;
    case 14:
      return <Hash size={13} className={`${cls} ${cls}--constant`} />;
    case 7:
    case 8:
      return <CircleDot size={13} className={`${cls} ${cls}--property`} />;
    case 10:
    case 22:
      return <Braces size={13} className={`${cls} ${cls}--enum`} />;
    default:
      return <FileCode size={13} className={`${cls} ${cls}--default`} />;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface LspSymbol {
  name: string;
  kind: number;
  containerName?: string;
  location?: { uri: string; range: { start: { line: number; character: number } } };
  // DocumentSymbol fields
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
  selectionRange?: { start: { line: number; character: number } };
  children?: LspSymbol[];
  _uri?: string; // injected when flattening DocumentSymbol[]
}

function flattenDocumentSymbols(
  symbols: LspSymbol[],
  uri: string,
  out: LspSymbol[] = [],
): LspSymbol[] {
  for (const sym of symbols) {
    out.push({ ...sym, _uri: uri });
    if (sym.children?.length) flattenDocumentSymbols(sym.children, uri, out);
  }
  return out;
}

function symbolLine(sym: LspSymbol): number {
  return (
    sym.location?.range.start.line ?? sym.selectionRange?.start.line ?? sym.range?.start.line ?? 0
  );
}

function symbolUri(sym: LspSymbol): string {
  return sym.location?.uri ?? sym._uri ?? "";
}

function uriToPath(uri: string): string {
  return uri.replace(/^file:\/\//, "");
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

// ── Fuzzy match ────────────────────────────────────────────────────────────

interface Match {
  score: number;
  indices: number[];
}

function fuzzyMatch(text: string, query: string): Match | null {
  if (!query) return { score: 0, indices: [] };
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  const indices: number[] = [];
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return null;
    indices.push(idx);
    ti = idx + 1;
  }
  // Score: bonus for consecutive, start of string, start of word
  let score = 0;
  let consecutive = 0;
  for (let i = 0; i < indices.length; i++) {
    if (i > 0 && indices[i] === indices[i - 1] + 1) consecutive++;
    else consecutive = 0;
    score += consecutive * 3;
    if (indices[i] === 0) score += 5;
    const prev = text[indices[i] - 1];
    if (!prev || prev === " " || prev === "." || prev === "_" || prev === "-") score += 3;
  }
  return { score, indices };
}

function HighlightedName({ text, indices }: { text: string; indices: number[] }) {
  if (!indices.length) return <>{text}</>;
  const set = new Set(indices);
  return (
    <>
      {text.split("").map((ch, i) =>
        set.has(i) ? (
          <mark key={i} className="symbol-search__match">
            {ch}
          </mark>
        ) : (
          ch
        ),
      )}
    </>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  mode: "document" | "workspace";
  client: LspClient;
  /** File URI currently open — for document symbol mode */
  fileUri: string;
  onNavigate: (filePath: string, line: number, col: number) => void;
  onClose: () => void;
}

export default function SymbolSearch({ mode, client, fileUri, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [symbols, setSymbols] = useState<LspSymbol[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wsDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load document symbols once on open
  useEffect(() => {
    if (mode !== "document") return;
    setLoading(true);
    client
      .documentSymbols(fileUri)
      .then((res) => {
        const raw = (res as LspSymbol[]) ?? [];
        setSymbols(flattenDocumentSymbols(raw, fileUri));
      })
      .catch(() => setSymbols([]))
      .finally(() => setLoading(false));
  }, [mode, client, fileUri]);

  // Workspace symbols — debounced on query change
  const fetchWorkspace = useCallback(
    (q: string) => {
      if (mode !== "workspace") return;
      if (wsDebounce.current) clearTimeout(wsDebounce.current);
      wsDebounce.current = setTimeout(() => {
        setLoading(true);
        client
          .workspaceSymbols(q)
          .then((res) => setSymbols((res as LspSymbol[]) ?? []))
          .catch(() => setSymbols([]))
          .finally(() => setLoading(false));
      }, 120);
    },
    [mode, client],
  );

  useEffect(() => {
    if (mode === "workspace") fetchWorkspace(query);
  }, [query, mode, fetchWorkspace]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Filter + rank for document mode (client-side fuzzy)
  const filtered = useMemo(() => {
    if (mode === "workspace") {
      // Already filtered by server; just fuzzy-rank
      if (!query) return symbols.map((s) => ({ sym: s, indices: [] as number[] }));
      return symbols
        .map((s) => ({ sym: s, m: fuzzyMatch(s.name, query) }))
        .filter((x) => x.m)
        .sort((a, b) => b.m!.score - a.m!.score)
        .map(({ sym, m }) => ({ sym, indices: m!.indices }));
    }
    if (!query) return symbols.map((s) => ({ sym: s, indices: [] as number[] }));
    return symbols
      .map((s) => ({ sym: s, m: fuzzyMatch(s.name, query) }))
      .filter((x) => x.m)
      .sort((a, b) => b.m!.score - a.m!.score)
      .map(({ sym, m }) => ({ sym, indices: m!.indices }));
  }, [symbols, query, mode]);

  useEffect(() => {
    setActive(0);
  }, [filtered]);

  // Scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function commit(sym: LspSymbol) {
    const path = uriToPath(symbolUri(sym));
    const line = symbolLine(sym);
    const col = sym.location?.range.start.character ?? sym.selectionRange?.start.character ?? 0;
    onNavigate(path, line, col);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) commit(filtered[active].sym);
    }
  }

  return (
    <div
      className="symbol-search-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="symbol-search">
        <div className="symbol-search__header">
          <Search size={14} className="symbol-search__icon" />
          <input
            ref={inputRef}
            className="symbol-search__input"
            placeholder={
              mode === "document" ? "Go to symbol in file…" : "Go to symbol in workspace…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <span className="symbol-search__spinner" />}
        </div>

        <div className="symbol-search__list" ref={listRef}>
          {filtered.length === 0 && !loading && (
            <div className="symbol-search__empty">
              {query ? "No matching symbols" : "No symbols found"}
            </div>
          )}
          {filtered.map(({ sym, indices }, i) => {
            const path = uriToPath(symbolUri(sym));
            return (
              <button
                key={i}
                data-idx={i}
                type="button"
                className={`symbol-search__item ${i === active ? "symbol-search__item--active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(sym)}
              >
                <KindIcon kind={sym.kind} />
                <span className="symbol-search__name">
                  <HighlightedName text={sym.name} indices={indices} />
                  {sym.containerName && (
                    <span className="symbol-search__container">{sym.containerName}</span>
                  )}
                </span>
                <span className="symbol-search__meta">
                  {mode === "workspace" && path && (
                    <span className="symbol-search__file">{basename(path)}</span>
                  )}
                  <span className="symbol-search__kind">{KIND_LABELS[sym.kind] ?? "symbol"}</span>
                  <span className="symbol-search__line">:{symbolLine(sym) + 1}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
