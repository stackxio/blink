import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, File, Folder, FolderOpen, FolderPlus } from "lucide-react";

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
    const stored = localStorage.getItem(`caret:expanded:${rootPath}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch { return new Set(); }
}

function saveExpandedDirs(rootPath: string, dirs: Set<string>) {
  localStorage.setItem(`caret:expanded:${rootPath}`, JSON.stringify([...dirs]));
}

export interface FileTreeHandle {
  collapseAll: () => void;
}

const FileTree = forwardRef<FileTreeHandle, Props>(function FileTree({ rootPath, onOpenFolder, onFileSelect, activeFilePath }, ref) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [creating, setCreating] = useState<{ parentPath: string; type: "file" | "dir" } | null>(null);
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bgMenuRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<Set<string>>(new Set());

  useImperativeHandle(ref, () => ({
    collapseAll: () => {
      expandedRef.current.clear();
      if (rootPath) {
        saveExpandedDirs(rootPath, expandedRef.current);
        loadDir(rootPath).then(setTree).catch(() => setTree([]));
      }
    },
  }));

  useEffect(() => {
    if (!rootPath) { setTree([]); return; }
    expandedRef.current = loadExpandedDirs(rootPath);
    loadDirRecursive(rootPath, expandedRef.current).then(setTree).catch(() => setTree([]));
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

  function refreshTree() {
    if (rootPath) loadDir(rootPath).then(setTree).catch(() => setTree([]));
  }

  const toggleDir = useCallback(async (node: TreeNode, path: number[]) => {
    const willExpand = !node.expanded;

    // Persist expanded state
    if (rootPath) {
      if (willExpand) expandedRef.current.add(node.path);
      else expandedRef.current.delete(node.path);
      saveExpandedDirs(rootPath, expandedRef.current);
    }

    setTree((prev) => {
      const next = structuredClone(prev);
      let target = next as TreeNode[];
      for (let i = 0; i < path.length - 1; i++) target = target[path[i]].children!;
      target[path[path.length - 1]].expanded = willExpand;
      return next;
    });
    if (willExpand && node.children === null) {
      try {
        const children = await loadDir(node.path);
        setTree((prev) => {
          const next = structuredClone(prev);
          let target = next as TreeNode[];
          for (let i = 0; i < path.length - 1; i++) target = target[path[i]].children!;
          target[path[path.length - 1]].children = children;
          return next;
        });
      } catch {}
    }
  }, [rootPath]);

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
    const name = ctxMenu.node.name;
    setCtxMenu(null);
    try {
      await invoke("delete_path", { path: ctxMenu.node.path });
      refreshTree();
    } catch {
      // failed
    }
  }

  function handleNewFile() {
    if (!ctxMenu) return;
    const parentPath = ctxMenu.node.is_dir ? ctxMenu.node.path : ctxMenu.node.path.replace(/\/[^/]+$/, "");
    setCreating({ parentPath, type: "file" });
    setCtxMenu(null);
  }

  function handleNewFolder() {
    if (!ctxMenu) return;
    const parentPath = ctxMenu.node.is_dir ? ctxMenu.node.path : ctxMenu.node.path.replace(/\/[^/]+$/, "");
    setCreating({ parentPath, type: "dir" });
    setCtxMenu(null);
  }

  async function handleRenameSubmit(newName: string) {
    if (!renaming || !newName.trim()) { setRenaming(null); return; }
    try {
      await invoke("rename_path", { oldPath: renaming.path, newName: newName.trim() });
      refreshTree();
    } catch {}
    setRenaming(null);
  }

  async function handleCreateSubmit(name: string) {
    if (!creating || !name.trim()) { setCreating(null); return; }
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

  return (
    <div className="file-tree" onContextMenu={handleBgContextMenu}>
      <TreeItems
        nodes={tree}
        depth={0}
        parentPath={[]}
        onToggle={toggleDir}
        onFileSelect={onFileSelect}
        activeFilePath={activeFilePath}
        onContextMenu={(e, node) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, node }); }}
        renaming={renaming}
        onRenameSubmit={handleRenameSubmit}
        creating={creating}
        onCreateSubmit={handleCreateSubmit}
      />

      {/* Context menu */}
      {ctxMenu && (
        <div ref={menuRef} className="menu" style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 200 }}>
          <button type="button" className="menu__item" onClick={handleRevealInFinder}>Reveal in Finder</button>
          <div className="menu__separator" />
          <button type="button" className="menu__item" onClick={handleNewFile}>New File</button>
          <button type="button" className="menu__item" onClick={handleNewFolder}>New Folder</button>
          <div className="menu__separator" />
          <button type="button" className="menu__item" onClick={handleCopyPath}>Copy Path</button>
          <button type="button" className="menu__item" onClick={handleCopyRelativePath}>Copy Relative Path</button>
          <div className="menu__separator" />
          <button type="button" className="menu__item" onClick={handleStartRename}>Rename…</button>
          <button type="button" className="menu__item menu__item--danger" onClick={handleDelete}>Delete</button>
        </div>
      )}

      {/* Background context menu (right-click empty space) */}
      {bgMenu && (
        <div ref={bgMenuRef} className="menu" style={{ position: "fixed", left: bgMenu.x, top: bgMenu.y, zIndex: 200 }}>
          <button type="button" className="menu__item" onClick={handleBgNewFile}>New File</button>
          <button type="button" className="menu__item" onClick={handleBgNewFolder}>New Folder</button>
          <div className="menu__separator" />
          <button type="button" className="menu__item" onClick={handleBgRevealInFinder}>Reveal in Finder</button>
          <button type="button" className="menu__item" onClick={handleBgCopyPath}>Copy Path</button>
        </div>
      )}
    </div>
  );
});

export default FileTree;

function TreeItems({
  nodes, depth, parentPath, onToggle, onFileSelect, activeFilePath, onContextMenu, renaming, onRenameSubmit, creating, onCreateSubmit,
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
}) {
  return (
    <>
      {nodes.map((node, i) => {
        const itemPath = [...parentPath, i];
        const isActive = node.path === activeFilePath;
        const isRenaming = renaming?.path === node.path;

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
                className={[
                  "file-tree__item",
                  node.is_dir ? "file-tree__item--dir" : "file-tree__item--file",
                  isActive && "file-tree__item--active",
                ].filter(Boolean).join(" ")}
                style={{ paddingLeft: 8 + depth * 16 }}
                onClick={() => node.is_dir ? onToggle(node, itemPath) : onFileSelect(node.path, node.name, true)}
                onDoubleClick={() => !node.is_dir && onFileSelect(node.path, node.name, false)}
                onContextMenu={(e) => onContextMenu(e, node)}
              >
                <span className={[
                  "file-tree__chevron",
                  node.is_dir && node.expanded && "file-tree__chevron--expanded",
                  !node.is_dir && "file-tree__chevron--hidden",
                ].filter(Boolean).join(" ")}>
                  <ChevronRight />
                </span>
                <span className="file-tree__icon">
                  {node.is_dir ? (node.expanded ? <FolderOpen /> : <Folder />) : <File />}
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
  defaultValue, depth, onSubmit, onCancel, placeholder,
}: {
  defaultValue: string;
  depth: number;
  onSubmit: (v: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

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
