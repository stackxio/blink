import {
  useState,
  useCallback,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, FolderPlus, X, Bookmark, BookmarkX } from "lucide-react";
import { ExplorerIcon } from "./explorer-icons";

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  extension: string | null;
}

interface TreeNode extends DirEntry {
  children: TreeNode[] | null;
  expanded: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: TreeNode;
}

interface Bookmark {
  path: string;
  name: string;
  is_dir: boolean;
}

function loadBookmarks(rootPath: string): Bookmark[] {
  try {
    return JSON.parse(localStorage.getItem(`codrift:bookmarks:${rootPath}`) ?? "[]");
  } catch {
    return [];
  }
}

function saveBookmarks(rootPath: string, bookmarks: Bookmark[]) {
  localStorage.setItem(`codrift:bookmarks:${rootPath}`, JSON.stringify(bookmarks));
}

interface Props {
  rootPath: string | null;
  onOpenFolder: () => void;
  onFileSelect: (path: string, name: string, preview: boolean) => void;
  activeFilePath: string | null;
}

function loadExpandedDirs(rootPath: string): Set<string> {
  try {
    const stored = localStorage.getItem(`codrift:expanded:${rootPath}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpandedDirs(rootPath: string, dirs: Set<string>) {
  localStorage.setItem(`codrift:expanded:${rootPath}`, JSON.stringify([...dirs]));
}

export interface FileTreeHandle {
  collapseAll: () => void;
  refresh: () => void;
  refreshPath: (path: string) => void;
  newFile: () => void;
  newFolder: () => void;
}

function cloneAtPath(
  nodes: TreeNode[],
  path: number[],
  updater: (node: TreeNode) => TreeNode,
): TreeNode[] {
  if (path.length === 0) return nodes;
  const next = [...nodes];
  const [head, ...rest] = path;
  const target = next[head];
  if (!target) return nodes;
  next[head] =
    rest.length === 0
      ? updater(target)
      : {
          ...target,
          children: target.children ? cloneAtPath(target.children, rest, updater) : target.children,
        };
  return next;
}

function findNodePath(
  nodes: TreeNode[],
  targetPath: string,
  parentPath: number[] = [],
): number[] | null {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const nextPath = [...parentPath, i];
    if (node.path === targetPath) return nextPath;
    if (node.children) {
      const nested = findNodePath(node.children, targetPath, nextPath);
      if (nested) return nested;
    }
  }
  return null;
}

function parentDirectory(path: string) {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : path;
}

// ── Virtual scrolling helpers ──

const ITEM_HEIGHT = 22; // px — matches file-tree__item height
const OVERSCAN = 5; // extra rows above/below the visible window

interface FlatItem {
  node: TreeNode;
  depth: number;
  nodePath: number[];
}

/** Flatten the visible (expanded) tree into an ordered flat list for virtual scrolling. */
function flattenVisible(
  nodes: TreeNode[],
  depth: number,
  parentPath: number[],
  creating: { parentPath: string; type: "file" | "dir" } | null,
  rootPath: string | null,
  out: FlatItem[],
) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nodePath = [...parentPath, i];

    // Inject a synthetic "root create" slot before the first root item
    if (depth === 0 && i === 0 && creating && creating.parentPath === rootPath) {
      out.push({ node: { ...node, path: "__create_root__" }, depth: 0, nodePath: [] });
    }

    out.push({ node, depth, nodePath });

    if (node.is_dir && node.expanded) {
      // Inject "create inside dir" at the top of the expanded dir
      if (creating && creating.parentPath === node.path) {
        out.push({ node: { ...node, path: `__create_${node.path}__` }, depth: depth + 1, nodePath: [] });
      }
      if (node.children && node.children.length > 0) {
        flattenVisible(node.children, depth + 1, nodePath, creating, rootPath, out);
      }
    }
  }
}

const FileTree = forwardRef<FileTreeHandle, Props>(function FileTree(
  { rootPath, onOpenFolder, onFileSelect, activeFilePath },
  ref,
) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [creating, setCreating] = useState<{ parentPath: string; type: "file" | "dir" } | null>(
    null,
  );
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);
  const [filterText, setFilterText] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bgMenuRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<Set<string>>(new Set());
  const treeRef = useRef<TreeNode[]>([]);

  // Virtual scrolling state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);
  const [dragOver, setDragOver] = useState<string | null>(null);

  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  // ResizeObserver to track container height
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setContainerHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function loadDir(path: string): Promise<TreeNode[]> {
    const entries = await invoke<DirEntry[]>("read_dir", { path });
    return entries.map((e) => ({
      ...e,
      children: e.is_dir ? null : (undefined as unknown as null),
      expanded: false,
    }));
  }

  async function loadDirRecursive(path: string, expandedDirs: Set<string>): Promise<TreeNode[]> {
    const entries = await invoke<DirEntry[]>("read_dir", { path });
    const nodes: TreeNode[] = [];
    for (const e of entries) {
      const isExpanded = expandedDirs.has(e.path);
      const node: TreeNode = {
        ...e,
        children: e.is_dir ? null : (undefined as unknown as null),
        expanded: isExpanded,
      };
      if (e.is_dir && isExpanded) {
        try {
          node.children = await loadDirRecursive(e.path, expandedDirs);
        } catch {
          node.children = [];
        }
      }
      nodes.push(node);
    }
    return nodes;
  }

  useImperativeHandle(ref, () => ({
    collapseAll: () => {
      expandedRef.current.clear();
      if (rootPath) {
        saveExpandedDirs(rootPath, expandedRef.current);
        loadDir(rootPath)
          .then(setTree)
          .catch(() => setTree([]));
      }
    },
    refresh: () => {
      if (rootPath) {
        loadDirRecursive(rootPath, expandedRef.current)
          .then(setTree)
          .catch(() => {});
      }
    },
    refreshPath: (path: string) => {
      if (!rootPath) return;
      const dirPath = path === rootPath ? rootPath : parentDirectory(path);
      if (dirPath === rootPath) {
        loadDirRecursive(rootPath, expandedRef.current)
          .then(setTree)
          .catch(() => {});
        return;
      }
      const targetPath = findNodePath(treeRef.current, dirPath);
      if (!targetPath) return;
      loadDir(dirPath)
        .then((children) => {
          setTree((prev) =>
            cloneAtPath(prev, targetPath, (node) => ({
              ...node,
              children,
            })),
          );
        })
        .catch(() => {});
    },
    newFile: () => {
      if (rootPath) setCreating({ parentPath: rootPath, type: "file" });
    },
    newFolder: () => {
      if (rootPath) setCreating({ parentPath: rootPath, type: "dir" });
    },
  }));

  useEffect(() => {
    if (!rootPath) {
      setTree([]);
      setBookmarks([]);
      return;
    }
    expandedRef.current = loadExpandedDirs(rootPath);
    setBookmarks(loadBookmarks(rootPath));
    loadDirRecursive(rootPath, expandedRef.current)
      .then(setTree)
      .catch(() => setTree([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadDirRecursive is stable within the component
  }, [rootPath]);

  // Close background menu
  useEffect(() => {
    if (!bgMenu) return;
    function onClick(e: MouseEvent) {
      if (bgMenuRef.current && !bgMenuRef.current.contains(e.target as Node)) setBgMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setBgMenu(null);
    }
    setTimeout(() => {
      document.addEventListener("mousedown", onClick);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [bgMenu]);

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setCtxMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCtxMenu(null);
    }
    setTimeout(() => {
      document.addEventListener("mousedown", onClick);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  function refreshTree() {
    if (rootPath)
      loadDirRecursive(rootPath, expandedRef.current)
        .then(setTree)
        .catch(() => setTree([]));
  }

  const toggleDir = useCallback(
    async (node: TreeNode, path: number[]) => {
      const willExpand = !node.expanded;

      // Persist expanded state
      if (rootPath) {
        if (willExpand) expandedRef.current.add(node.path);
        else expandedRef.current.delete(node.path);
        saveExpandedDirs(rootPath, expandedRef.current);
      }

      setTree((prev) => {
        return cloneAtPath(prev, path, (current) => ({ ...current, expanded: willExpand }));
      });
      if (willExpand && node.children === null) {
        try {
          const children = await loadDir(node.path);
          setTree((prev) => {
            return cloneAtPath(prev, path, (current) => ({ ...current, children }));
          });
        } catch {}
      }
    },
    [rootPath],
  );

  // ── Bookmark actions ──
  function handleToggleBookmark() {
    if (!ctxMenu || !rootPath) return;
    const node = ctxMenu.node;
    const exists = bookmarks.some((b) => b.path === node.path);
    const next = exists
      ? bookmarks.filter((b) => b.path !== node.path)
      : [...bookmarks, { path: node.path, name: node.name, is_dir: node.is_dir }];
    setBookmarks(next);
    saveBookmarks(rootPath, next);
    setCtxMenu(null);
  }

  // ── Context menu actions ──
  async function handleRevealInFinder() {
    if (!ctxMenu) return;
    await invoke("reveal_in_finder", { path: ctxMenu.node.path }).catch(() => {});
    setCtxMenu(null);
  }

  async function handleCopyPath() {
    if (!ctxMenu) return;
    await navigator.clipboard.writeText(ctxMenu.node.path).catch(() => {});
    setCtxMenu(null);
  }

  async function handleCopyRelativePath() {
    if (!ctxMenu || !rootPath) return;
    const rel = ctxMenu.node.path.replace(rootPath + "/", "");
    await navigator.clipboard.writeText(rel).catch(() => {});
    setCtxMenu(null);
  }

  function handleStartRename() {
    if (!ctxMenu) return;
    setRenaming({ path: ctxMenu.node.path, name: ctxMenu.node.name });
    setCtxMenu(null);
  }

  async function handleDelete() {
    if (!ctxMenu) return;
    setCtxMenu(null);
    try {
      await invoke("delete_path", { path: ctxMenu.node.path });
      refreshTree();
    } catch {
      // failed
    }
  }

  function startCreating(
    parentPath: string,
    type: "file" | "dir",
    nodeToExpand?: TreeNode,
    nodePath?: number[],
  ) {
    setCreating({ parentPath, type });
    setCtxMenu(null);
    // Auto-expand collapsed directory so the InlineInput becomes visible
    if (nodeToExpand && nodePath && nodeToExpand.is_dir && !nodeToExpand.expanded) {
      void toggleDir(nodeToExpand, nodePath);
    }
  }

  function handleNewFile() {
    if (!ctxMenu) return;
    const isDir = ctxMenu.node.is_dir;
    const parentPath = isDir ? ctxMenu.node.path : ctxMenu.node.path.replace(/\/[^/]+$/, "");
    const nodePath = isDir
      ? (findNodePath(treeRef.current, ctxMenu.node.path) ?? undefined)
      : undefined;
    startCreating(parentPath, "file", isDir ? ctxMenu.node : undefined, nodePath);
  }

  function handleNewFolder() {
    if (!ctxMenu) return;
    const isDir = ctxMenu.node.is_dir;
    const parentPath = isDir ? ctxMenu.node.path : ctxMenu.node.path.replace(/\/[^/]+$/, "");
    const nodePath = isDir
      ? (findNodePath(treeRef.current, ctxMenu.node.path) ?? undefined)
      : undefined;
    startCreating(parentPath, "dir", isDir ? ctxMenu.node : undefined, nodePath);
  }

  async function handleRenameSubmit(newName: string) {
    if (!renaming || !newName.trim()) {
      setRenaming(null);
      return;
    }
    try {
      await invoke("rename_path", { oldPath: renaming.path, newName: newName.trim() });
      refreshTree();
    } catch {}
    setRenaming(null);
  }

  async function handleCreateSubmit(name: string) {
    if (!creating || !name.trim()) {
      setCreating(null);
      return;
    }
    const fullPath = `${creating.parentPath}/${name.trim()}`;
    try {
      if (creating.type === "file") {
        await invoke("create_file", { path: fullPath });
        onFileSelect(fullPath, name.trim(), false);
      } else {
        await invoke("create_directory", { path: fullPath });
      }
      refreshTree();
    } catch {}
    setCreating(null);
  }

  function flattenFiltered(nodes: TreeNode[], query: string): TreeNode[] {
    const results: TreeNode[] = [];
    for (const node of nodes) {
      if (node.name.toLowerCase().includes(query.toLowerCase())) {
        results.push(node);
      }
      if (node.children) {
        results.push(...flattenFiltered(node.children, query));
      }
    }
    return results;
  }

  if (!rootPath) {
    return (
      <div className="file-tree">
        <button type="button" className="file-tree__open-folder" onClick={onOpenFolder}>
          <FolderPlus size={16} />
          Open Folder
        </button>
      </div>
    );
  }

  function handleBgContextMenu(e: React.MouseEvent) {
    // Only trigger if clicking the tree background, not a file item
    if ((e.target as HTMLElement).closest(".file-tree__item")) return;
    e.preventDefault();
    setBgMenu({ x: e.clientX, y: e.clientY });
  }

  function handleBgNewFile() {
    if (!rootPath) return;
    setCreating({ parentPath: rootPath, type: "file" });
    setBgMenu(null);
  }

  function handleBgNewFolder() {
    if (!rootPath) return;
    setCreating({ parentPath: rootPath, type: "dir" });
    setBgMenu(null);
  }

  async function handleBgRevealInFinder() {
    if (!rootPath) return;
    await invoke("reveal_in_finder", { path: rootPath }).catch(() => {});
    setBgMenu(null);
  }

  async function handleBgCopyPath() {
    if (!rootPath) return;
    await navigator.clipboard.writeText(rootPath).catch(() => {});
    setBgMenu(null);
  }

  async function handleMove(srcPath: string, destDir: string) {
    const name = srcPath.split("/").pop() || srcPath;
    const destPath = `${destDir}/${name}`;
    try {
      await invoke("rename_path", { oldPath: srcPath, newPath: destPath });
      if (rootPath) {
        const sourceDir = parentDirectory(srcPath);
        if (sourceDir === destDir) {
          if (sourceDir === rootPath) {
            loadDirRecursive(rootPath, expandedRef.current)
              .then(setTree)
              .catch(() => {});
          } else {
            const targetPath = findNodePath(treeRef.current, sourceDir);
            if (!targetPath) {
              refreshTree();
              return;
            }
            loadDir(sourceDir)
              .then((children) => {
                setTree((prev) =>
                  cloneAtPath(prev, targetPath, (node) => ({
                    ...node,
                    children,
                  })),
                );
              })
              .catch(() => {});
          }
        } else {
          refreshTree();
        }
      }
    } catch (e) {
      console.error("Move failed:", e);
    }
  }

  // ── Virtual scrolling for the main tree ──

  // Build the complete flat visible list (memoised on tree + creating state)
  const flatItems = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    flattenVisible(tree, 0, [], creating, rootPath, out);
    return out;
  }, [tree, creating, rootPath]);

  const totalHeight = flatItems.length * ITEM_HEIGHT;

  // Compute which slice to render
  const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT) + OVERSCAN * 2;
  const endIdx = Math.min(flatItems.length, startIdx + visibleCount);
  const visibleItems = flatItems.slice(startIdx, endIdx);
  const paddingTop = startIdx * ITEM_HEIGHT;

  return (
    <div className="file-tree" onContextMenu={handleBgContextMenu}>
      {/* Bookmarks section */}
      {bookmarks.length > 0 && (
        <div className="file-tree__bookmarks">
          <div className="file-tree__bookmarks-header">
            <Bookmark size={11} />
            <span>Bookmarks</span>
          </div>
          {bookmarks.map((bm) => (
            <div key={bm.path} className="file-tree__bookmark-item">
              <button
                type="button"
                className={`file-tree__bookmark-btn${bm.path === activeFilePath ? " file-tree__bookmark-btn--active" : ""}`}
                onClick={() => { if (!bm.is_dir) onFileSelect(bm.path, bm.name, false); }}
                title={bm.path}
              >
                <ExplorerIcon name={bm.name} isDir={bm.is_dir} expanded={false} />
                <span className="file-tree__bookmark-name">{bm.name}</span>
              </button>
              <button
                type="button"
                className="file-tree__bookmark-remove"
                onClick={() => {
                  if (!rootPath) return;
                  const next = bookmarks.filter((b) => b.path !== bm.path);
                  setBookmarks(next);
                  saveBookmarks(rootPath, next);
                }}
                title="Remove bookmark"
              >
                <BookmarkX size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Filter bar */}
      <div className="file-tree__filter-bar">
        <input
          ref={filterInputRef}
          className="file-tree__filter-input"
          type="text"
          placeholder="Filter files…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setFilterText("");
              filterInputRef.current?.blur();
            }
          }}
          spellCheck={false}
        />
        {filterText && (
          <button
            type="button"
            className="file-tree__filter-clear"
            onClick={() => setFilterText("")}
          >
            <X size={11} />
          </button>
        )}
      </div>

      {filterText.trim() ? (
        <div className="file-tree__filtered-results">
          {flattenFiltered(tree, filterText.trim()).length === 0 ? (
            <div className="file-tree__filter-empty">No matches</div>
          ) : (
            flattenFiltered(tree, filterText.trim()).map((node) => (
              <button
                key={node.path}
                type="button"
                className={`file-tree__filter-item${node.path === activeFilePath ? " file-tree__filter-item--active" : ""}`}
                onClick={() => {
                  if (!node.is_dir) onFileSelect(node.path, node.name, false);
                }}
                title={node.path}
              >
                <ExplorerIcon name={node.name} isDir={node.is_dir} expanded={false} />
                <span className="file-tree__filter-name">{node.name}</span>
                <span className="file-tree__filter-path">
                  {rootPath
                    ? node.path.replace(rootPath + "/", "").replace("/" + node.name, "")
                    : ""}
                </span>
              </button>
            ))
          )}
        </div>
      ) : (
        /* Virtually-scrolled tree list */
        <div
          ref={scrollContainerRef}
          className="file-tree__scroll"
          style={{ overflow: "auto", flex: 1, minHeight: 0 }}
          onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
        >
          {/* Total height spacer so scrollbar is sized correctly */}
          <div style={{ height: totalHeight, position: "relative" }}>
            {/* Only the visible slice, offset to its correct position */}
            <div style={{ position: "absolute", top: paddingTop, left: 0, right: 0 }}>
              {visibleItems.map(({ node, depth, nodePath }) => {
                // Synthetic create-input rows
                if (node.path === "__create_root__") {
                  return (
                    <InlineInput
                      key="__create_root__"
                      defaultValue=""
                      depth={0}
                      onSubmit={handleCreateSubmit}
                      onCancel={() => setCreating(null)}
                      placeholder={creating?.type === "file" ? "filename…" : "folder name…"}
                    />
                  );
                }
                if (node.path.startsWith("__create_")) {
                  return (
                    <InlineInput
                      key={node.path}
                      defaultValue=""
                      depth={depth}
                      onSubmit={handleCreateSubmit}
                      onCancel={() => setCreating(null)}
                      placeholder={creating?.type === "file" ? "filename…" : "folder name…"}
                    />
                  );
                }

                const isActive = node.path === activeFilePath;
                const isRenaming = renaming?.path === node.path;
                const isDragOver = dragOver === node.path && node.is_dir;

                if (isRenaming) {
                  return (
                    <InlineInput
                      key={node.path}
                      defaultValue={renaming!.name}
                      depth={depth}
                      onSubmit={handleRenameSubmit}
                      onCancel={() => handleRenameSubmit("")}
                    />
                  );
                }

                return (
                  <button
                    key={node.path}
                    type="button"
                    draggable
                    className={[
                      "file-tree__item",
                      node.is_dir ? "file-tree__item--dir" : "file-tree__item--file",
                      isActive && "file-tree__item--active",
                      isDragOver && "file-tree__item--drag-over",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ paddingLeft: 8 + depth * 16 }}
                    onClick={() =>
                      node.is_dir
                        ? toggleDir(node, nodePath)
                        : onFileSelect(node.path, node.name, true)
                    }
                    onDoubleClick={() => !node.is_dir && onFileSelect(node.path, node.name, false)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, node });
                    }}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", node.path);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (!node.is_dir) return;
                      if (!e.dataTransfer.types.includes("text/plain")) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOver(node.path);
                    }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => {
                      setDragOver(null);
                      if (!node.is_dir) return;
                      const src = e.dataTransfer.getData("text/plain");
                      if (!src) return;
                      e.preventDefault();
                      if (src !== node.path) handleMove(src, node.path);
                    }}
                  >
                    <span
                      className={[
                        "file-tree__chevron",
                        node.is_dir && node.expanded && "file-tree__chevron--expanded",
                        !node.is_dir && "file-tree__chevron--hidden",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <ChevronRight />
                    </span>
                    <span className="file-tree__icon">
                      <ExplorerIcon name={node.name} isDir={node.is_dir} expanded={node.expanded} />
                    </span>
                    <span className="file-tree__name">{node.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={menuRef}
          className="menu"
          style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 200 }}
        >
          <button type="button" className="menu__item" onClick={handleRevealInFinder}>
            Reveal in Finder
          </button>
          <div className="menu__separator" />
          <button type="button" className="menu__item" onClick={handleNewFile}>
            New File
          </button>
          <button type="button" className="menu__item" onClick={handleNewFolder}>
            New Folder
          </button>
          <div className="menu__separator" />
          <button type="button" className="menu__item" onClick={handleCopyPath}>
            Copy Path
          </button>
          <button type="button" className="menu__item" onClick={handleCopyRelativePath}>
            Copy Relative Path
          </button>
          <div className="menu__separator" />
          <button type="button" className="menu__item" onClick={handleStartRename}>
            Rename…
          </button>
          <button
            type="button"
            className="menu__item"
            onClick={handleToggleBookmark}
          >
            {bookmarks.some((b) => b.path === ctxMenu.node.path) ? (
              <>
                <BookmarkX size={14} />
                Remove Bookmark
              </>
            ) : (
              <>
                <Bookmark size={14} />
                Add Bookmark
              </>
            )}
          </button>
          <button type="button" className="menu__item menu__item--danger" onClick={handleDelete}>
            Delete
          </button>
        </div>
      )}

      {/* Background context menu (right-click empty space) */}
      {bgMenu && (
        <div
          ref={bgMenuRef}
          className="menu"
          style={{ position: "fixed", left: bgMenu.x, top: bgMenu.y, zIndex: 200 }}
        >
          <button type="button" className="menu__item" onClick={handleBgNewFile}>
            New File
          </button>
          <button type="button" className="menu__item" onClick={handleBgNewFolder}>
            New Folder
          </button>
          <div className="menu__separator" />
          <button type="button" className="menu__item" onClick={handleBgRevealInFinder}>
            Reveal in Finder
          </button>
          <button type="button" className="menu__item" onClick={handleBgCopyPath}>
            Copy Path
          </button>
        </div>
      )}
    </div>
  );
});

export default FileTree;

function InlineInput({
  defaultValue,
  depth,
  onSubmit,
  onCancel,
  placeholder,
}: {
  defaultValue: string;
  depth: number;
  onSubmit: (v: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div className="file-tree__item" style={{ paddingLeft: 8 + depth * 16 }}>
      <input
        ref={ref}
        className="input input--sm"
        defaultValue={defaultValue}
        placeholder={placeholder}
        style={{ height: 22, flex: 1, minWidth: 0 }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit((e.target as HTMLInputElement).value);
          if (e.key === "Escape") onCancel();
        }}
        onBlur={(e) => onSubmit(e.target.value)}
      />
    </div>
  );
}
