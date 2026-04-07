import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, FolderPlus, X } from "lucide-react";
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

const FileTree = forwardRef<FileTreeHandle, Props>(function FileTree(
  { rootPath, onOpenFolder, onFileSelect, activeFilePath },
  ref,
) {
  const [tree, setTree] = useState<TreeNode[]>([]);
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

  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

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
      return;
    }
    expandedRef.current = loadExpandedDirs(rootPath);
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

  return (
    <div className="file-tree" onContextMenu={handleBgContextMenu}>
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
        <>
          {/* Root-level new file/folder input */}
          {creating && creating.parentPath === rootPath && (
            <InlineInput
              defaultValue=""
              depth={0}
              onSubmit={handleCreateSubmit}
              onCancel={() => setCreating(null)}
              placeholder={creating.type === "file" ? "filename…" : "folder name…"}
            />
          )}
          <TreeItems
            nodes={tree}
            depth={0}
            parentPath={[]}
            onToggle={toggleDir}
            onFileSelect={onFileSelect}
            activeFilePath={activeFilePath}
            onContextMenu={(e, node) => {
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY, node });
            }}
            renaming={renaming}
            onRenameSubmit={handleRenameSubmit}
            creating={creating}
            onCreateSubmit={handleCreateSubmit}
            onMove={handleMove}
          />
        </>
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

function TreeItems({
  nodes,
  depth,
  parentPath,
  onToggle,
  onFileSelect,
  activeFilePath,
  onContextMenu,
  renaming,
  onRenameSubmit,
  creating,
  onCreateSubmit,
  onMove,
}: {
  nodes: TreeNode[];
  depth: number;
  parentPath: number[];
  onToggle: (node: TreeNode, path: number[]) => void;
  onFileSelect: (path: string, name: string, preview: boolean) => void;
  activeFilePath: string | null;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  renaming: { path: string; name: string } | null;
  onRenameSubmit: (name: string) => void;
  creating: { parentPath: string; type: "file" | "dir" } | null;
  onCreateSubmit: (name: string) => void;
  onMove: (srcPath: string, destDir: string) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);

  return (
    <>
      {nodes.map((node, i) => {
        const itemPath = [...parentPath, i];
        const isActive = node.path === activeFilePath;
        const isRenaming = renaming?.path === node.path;
        const isDragOver = dragOver === node.path && node.is_dir;

        return (
          <div key={node.path}>
            {isRenaming ? (
              <InlineInput
                defaultValue={renaming!.name}
                depth={depth}
                onSubmit={onRenameSubmit}
                onCancel={() => onRenameSubmit("")}
              />
            ) : (
              <button
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
                  node.is_dir ? onToggle(node, itemPath) : onFileSelect(node.path, node.name, true)
                }
                onDoubleClick={() => !node.is_dir && onFileSelect(node.path, node.name, false)}
                onContextMenu={(e) => onContextMenu(e, node)}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", node.path);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (!node.is_dir) return;
                  // Only accept internal tree drags — ignore external file drops from Finder etc.
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
                  if (!src) return; // external drop — ignore
                  e.preventDefault();
                  if (src !== node.path) onMove(src, node.path);
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
            )}

            {node.is_dir && node.expanded && (
              <>
                {/* Show "new file/folder" input at top of expanded dir */}
                {creating && creating.parentPath === node.path && (
                  <InlineInput
                    defaultValue=""
                    depth={depth + 1}
                    onSubmit={onCreateSubmit}
                    onCancel={() => onCreateSubmit("")}
                    placeholder={creating.type === "file" ? "filename…" : "folder name…"}
                  />
                )}
                {node.children && node.children.length > 0 && (
                  <TreeItems
                    nodes={node.children}
                    depth={depth + 1}
                    parentPath={itemPath}
                    onToggle={onToggle}
                    onFileSelect={onFileSelect}
                    activeFilePath={activeFilePath}
                    onContextMenu={onContextMenu}
                    renaming={renaming}
                    onRenameSubmit={onRenameSubmit}
                    creating={creating}
                    onCreateSubmit={onCreateSubmit}
                    onMove={onMove}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

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
