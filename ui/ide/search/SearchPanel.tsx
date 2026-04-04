import { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Replace, ChevronRight, FileText, RefreshCw } from "lucide-react";

interface SearchResult {
  path: string;
  line_number: number;
  line_text: string;
  column: number;
}

interface Props {
  workspacePath: string | null;
  onOpenFile: (path: string, name: string, line: number) => void;
}

export interface SearchPanelHandle {
  focusInput: (text?: string) => void;
}

const SearchPanel = forwardRef<SearchPanelHandle, Props>(function SearchPanel(
  { workspacePath, onOpenFile },
  ref,
) {
  const [query, setQuery] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [replaceValue, setReplaceValue] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceResult, setReplaceResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    (q: string) => {
      if (!q.trim() || !workspacePath) {
        setResults([]);
        setSearched(false);
        return;
      }
      setSearching(true);
      invoke<SearchResult[]>("search_in_files", {
        root: workspacePath,
        query: q,
        maxResults: 200,
        caseSensitive,
        wholeWord,
        isRegex: useRegex,
      })
        .then((res) => {
          setResults(res);
          setSearched(true);
        })
        .catch(() => {
          setResults([]);
          setSearched(true);
        })
        .finally(() => setSearching(false));
    },
    [workspacePath, caseSensitive, wholeWord, useRegex],
  );

  useImperativeHandle(ref, () => ({
    focusInput: (text?: string) => {
      if (text && inputRef.current) {
        setQuery(text);
        inputRef.current.value = text;
        // Trigger search
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => doSearch(text), 100);
      }
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(value), 300);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (timerRef.current) clearTimeout(timerRef.current);
      doSearch(query);
    }
  }

  async function doReplaceAll() {
    if (!query.trim() || !workspacePath) return;
    setReplacing(true);
    setReplaceResult(null);
    try {
      const res = await invoke<{ files_modified: number; replacements_made: number }>(
        "replace_in_files",
        {
          root: workspacePath,
          query,
          replacement: replaceValue,
          caseSensitive,
          wholeWord,
          isRegex: useRegex,
        },
      );
      setReplaceResult(
        `Replaced ${res.replacements_made} occurrence${res.replacements_made !== 1 ? "s" : ""} in ${res.files_modified} file${res.files_modified !== 1 ? "s" : ""}.`,
      );
      // Re-run search to update results
      doSearch(query);
    } catch (e) {
      setReplaceResult(`Error: ${String(e)}`);
    } finally {
      setReplacing(false);
    }
  }

  // Group results by file
  const grouped = new Map<string, SearchResult[]>();
  for (const r of results) {
    const arr = grouped.get(r.path) || [];
    arr.push(r);
    grouped.set(r.path, arr);
  }

  function fileName(path: string): string {
    return path.split("/").pop() || path;
  }

  function relativePath(path: string): string {
    if (workspacePath && path.startsWith(workspacePath)) {
      return path.slice(workspacePath.length).replace(/^\//, "");
    }
    return path;
  }

  function highlightMatch(text: string, col: number): React.ReactNode {
    const start = col - 1;
    const end = start + query.length;
    if (start < 0 || end > text.length) return text;
    return (
      <>
        {text.slice(0, start)}
        <span className="search-panel__match">{text.slice(start, end)}</span>
        {text.slice(end)}
      </>
    );
  }

  return (
    <div className="search-panel">
      <div className="search-panel__inputs">
        <div className="search-panel__row">
          <button
            type="button"
            className={`search-panel__toggle ${showReplace ? "search-panel__toggle--active" : ""}`}
            onClick={() => setShowReplace(!showReplace)}
            title="Toggle Replace"
          >
            <ChevronRight size={14} />
          </button>
          <div className="search-panel__field">
            <Search size={14} className="search-panel__icon" />
            <input
              ref={inputRef}
              className="search-panel__input"
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />
            <div className="search-panel__filters">
              <button
                type="button"
                className={`search-panel__filter ${caseSensitive ? "search-panel__filter--active" : ""}`}
                onClick={() => {
                  setCaseSensitive((v) => !v);
                  if (query) doSearch(query);
                }}
                title="Match Case"
              >
                Aa
              </button>
              <button
                type="button"
                className={`search-panel__filter ${wholeWord ? "search-panel__filter--active" : ""}`}
                onClick={() => {
                  setWholeWord((v) => !v);
                  if (query) doSearch(query);
                }}
                title="Match Whole Word"
              >
                <span style={{ textDecoration: "underline" }}>ab</span>
              </button>
              <button
                type="button"
                className={`search-panel__filter ${useRegex ? "search-panel__filter--active" : ""}`}
                onClick={() => {
                  setUseRegex((v) => !v);
                  if (query) doSearch(query);
                }}
                title="Use Regular Expression"
              >
                .*
              </button>
            </div>
          </div>
        </div>
        {showReplace && (
          <div className="search-panel__row">
            <div className="search-panel__toggle-spacer" />
            <div className="search-panel__field">
              <Replace size={14} className="search-panel__icon" />
              <input
                className="search-panel__input"
                type="text"
                placeholder="Replace"
                value={replaceValue}
                onChange={(e) => setReplaceValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doReplaceAll();
                }}
                spellCheck={false}
              />
              <button
                type="button"
                className="search-panel__filter"
                title="Replace All"
                disabled={replacing || !query.trim() || results.length === 0}
                onClick={doReplaceAll}
                style={{ padding: "0 6px" }}
              >
                <RefreshCw size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="search-panel__results">
        {searching && <div className="search-panel__status">Searching...</div>}
        {replacing && <div className="search-panel__status">Replacing...</div>}
        {replaceResult && !replacing && (
          <div className="search-panel__status" style={{ color: "var(--c-accent)" }}>
            {replaceResult}
          </div>
        )}
        {!searching && !replacing && !replaceResult && searched && results.length === 0 && (
          <div className="search-panel__status">No results found</div>
        )}
        {!searching && !replacing && results.length > 0 && (
          <div className="search-panel__status">
            {results.length} result{results.length !== 1 ? "s" : ""} in {grouped.size} file
            {grouped.size !== 1 ? "s" : ""}
          </div>
        )}
        {Array.from(grouped.entries()).map(([filePath, matches]) => (
          <div key={filePath} className="search-panel__file-group">
            <div className="search-panel__file-header">
              <FileText size={14} />
              <span className="search-panel__file-name">{fileName(filePath)}</span>
              <span className="search-panel__file-path">{relativePath(filePath)}</span>
              <span className="search-panel__file-count">{matches.length}</span>
            </div>
            {matches.map((m, i) => (
              <button
                key={i}
                type="button"
                className="search-panel__result"
                onClick={() => onOpenFile(m.path, fileName(m.path), m.line_number)}
              >
                <span className="search-panel__line-num">{m.line_number}</span>
                <span className="search-panel__line-text">
                  {highlightMatch(
                    m.line_text.trim(),
                    m.column - (m.line_text.length - m.line_text.trimStart().length),
                  )}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

export default SearchPanel;
