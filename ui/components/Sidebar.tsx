import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PanelLeftClose, Plus, FolderPlus, ListFilter, Clock, Archive, Settings, Pencil, Trash2, FolderOpen } from "lucide-react";
import type { ChatThread, Folder } from "@/layout/ChatLayout";
import { FolderIconRender } from "@/lib/folder-icons";

interface SidebarProps {
  folders: Folder[];
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onSelectFolder: (folderId: string) => void;
  onNewThread: (folderId?: string | null) => void;
  onNewFolder: (name: string, scopeMode?: string, rootPath?: string | null) => void;
  onToggleFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
  onMoveThread: (threadId: string, folderId: string | null) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onUpdateFolderAppearance?: (
    folderId: string,
    updates: { icon?: string; color?: string },
  ) => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  onOpenAutomations: () => void;
}

export default function Sidebar({
  folders,
  threads,
  activeThreadId,
  onSelectThread,
  onSelectFolder,
  onNewThread,
  onNewFolder,
  onToggleFolder,
  onDeleteFolder,
  onDeleteThread,
  onArchiveThread,
  onMoveThread,
  onRenameFolder,
  onRenameThread,
  onOpenSettings,
  onToggleSidebar,
  onOpenAutomations,
}: SidebarProps) {
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newProjectRoot, setNewProjectRoot] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingFolderName, setRenamingFolderName] = useState("");
  const renameFolderInputRef = useRef<HTMLInputElement>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renamingThreadName, setRenamingThreadName] = useState("");
  const renameThreadInputRef = useRef<HTMLInputElement>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "folder" | "thread";
    id: string;
  } | null>(null);

  const [moveThreadId, setMoveThreadId] = useState<string | null>(null);
  const [moveSearch, setMoveSearch] = useState("");

  const looseThreads = threads.filter((t) => t.folderId === null);

  function threadsInFolder(folderId: string) {
    return threads.filter((t) => t.folderId === folderId);
  }

  function handleContextMenu(e: React.MouseEvent, type: "folder" | "thread", id: string) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  // Folder creation
  function handleStartCreateFolder() {
    setIsCreatingFolder(true);
    setNewFolderName("");
  }

  async function handlePickDirectory() {
    try {
      const path = await invoke<string | null>("pick_directory");
      if (path != null) setNewProjectRoot(path);
    } catch {
      // user cancelled or error
    }
  }

  function handleConfirmCreateFolder() {
    const name = newFolderName.trim();
    if (name) {
      onNewFolder(name, newProjectRoot ? "directory" : "system", newProjectRoot);
    }
    setIsCreatingFolder(false);
    setNewFolderName("");
    setNewProjectRoot(null);
  }

  function handleCancelCreateFolder() {
    setIsCreatingFolder(false);
    setNewFolderName("");
    setNewProjectRoot(null);
  }

  useEffect(() => {
    if (isCreatingFolder) folderInputRef.current?.focus();
  }, [isCreatingFolder]);

  // Folder renaming
  function handleStartRenameFolder(folderId: string, currentName: string) {
    setRenamingFolderId(folderId);
    setRenamingFolderName(currentName);
  }

  function handleConfirmRenameFolder() {
    if (renamingFolderId) {
      const name = renamingFolderName.trim();
      if (name) onRenameFolder(renamingFolderId, name);
    }
    setRenamingFolderId(null);
    setRenamingFolderName("");
  }

  function handleCancelRenameFolder() {
    setRenamingFolderId(null);
    setRenamingFolderName("");
  }

  useEffect(() => {
    if (renamingFolderId) renameFolderInputRef.current?.focus();
  }, [renamingFolderId]);

  // Thread renaming
  function handleStartRenameThread(threadId: string, currentTitle: string) {
    setRenamingThreadId(threadId);
    setRenamingThreadName(currentTitle);
  }

  function handleConfirmRenameThread() {
    if (renamingThreadId) {
      const name = renamingThreadName.trim();
      if (name) onRenameThread(renamingThreadId, name);
    }
    setRenamingThreadId(null);
    setRenamingThreadName("");
  }

  function handleCancelRenameThread() {
    setRenamingThreadId(null);
    setRenamingThreadName("");
  }

  useEffect(() => {
    if (renamingThreadId) renameThreadInputRef.current?.focus();
  }, [renamingThreadId]);

  return (
    <div
      className="relative flex h-full min-h-0 w-[260px] shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar text-[13px] text-foreground"
      onClick={closeContextMenu}
    >
      <aside className="flex h-full min-h-0 flex-1 flex-col">
        <div className="titlebar-no-drag flex flex-col gap-0.5 px-3 py-2">
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleSidebar}
              title="Hide sidebar (Cmd+B)"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <PanelLeftClose size={14} />
            </button>
            <button
              onClick={() => onNewThread(null)}
              className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <Plus size={16} />
              <span>New thread</span>
            </button>
          </div>
          <button
            onClick={onOpenAutomations}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            <Clock size={16} />
            <span>Automations</span>
          </button>
        </div>

        <div className="mx-2 border-t border-border" />

        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-1 px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Projects
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={handleStartCreateFolder}
                title="New project"
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                <FolderPlus size={14} />
              </button>
              <button
                title="Filter or sort"
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                <ListFilter size={14} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {isCreatingFolder && (
              <div className="mb-1 flex flex-col gap-1 rounded px-1.5 py-1">
                <div className="flex items-center gap-1.5">
                  <FolderIcon />
                  <input
                    ref={folderInputRef}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConfirmCreateFolder();
                      if (e.key === "Escape") handleCancelCreateFolder();
                    }}
                    onBlur={handleConfirmCreateFolder}
                    placeholder="Project name..."
                    className="flex-1 rounded bg-input px-1.5 py-0.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-muted-foreground"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePickDirectory}
                    className="flex items-center gap-1 rounded bg-surface-raised px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                    title="Choose directory (or leave for entire system)"
                  >
                    <FolderOpen size={12} />
                    {newProjectRoot ? "Change directory" : "Choose directory"}
                  </button>
                  {newProjectRoot && (
                    <span className="truncate text-xs text-muted-foreground" title={newProjectRoot}>
                      {newProjectRoot.split("/").pop() || newProjectRoot}
                    </span>
                  )}
                </div>
              </div>
            )}

            {folders.map((folder) => {
              const folderThreads = threadsInFolder(folder.id);
              const isRenaming = renamingFolderId === folder.id;

              return (
                <div
                  key={folder.id}
                  className="mb-0.5 w-full"
                  onContextMenu={(e) => handleContextMenu(e, "folder", folder.id)}
                >
                  <button
                    type="button"
                    onClick={() => !isRenaming && onToggleFolder(folder.id)}
                    className="flex w-full min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-surface-raised"
                  >
                    <FolderIconRender
                      name={folder.icon}
                      color={folder.color}
                      size={14}
                      className="shrink-0"
                    />
                    {isRenaming ? (
                      <input
                        ref={renameFolderInputRef}
                        value={renamingFolderName}
                        onChange={(e) => setRenamingFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") handleConfirmRenameFolder();
                          if (e.key === "Escape") handleCancelRenameFolder();
                        }}
                        onBlur={handleConfirmRenameFolder}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 rounded bg-input px-1 py-0 text-xs text-foreground outline-none focus:ring-1 focus:ring-muted-foreground"
                      />
                    ) : (
                      <span className="flex-1 truncate text-foreground">{folder.name}</span>
                    )}
                    <span className="shrink-0 text-muted-foreground">{folderThreads.length}</span>
                  </button>
                  {(folder.scopeMode === "directory" && folder.rootPath) || folder.scopeMode === "system" ? (
                    <div className="ml-5 mt-0.5 flex items-center gap-1">
                      <span
                        className={`rounded px-1 py-0.5 text-[10px] ${
                          folder.scopeMode === "directory"
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                        title={folder.scopeMode === "directory" ? folder.rootPath ?? undefined : "Entire system"}
                      >
                        {folder.scopeMode === "directory"
                          ? (folder.rootPath ?? "").split("/").filter(Boolean).pop() ?? "Directory"
                          : "System"}
                      </span>
                    </div>
                  ) : null}

                {folder.expanded && (
                  <div className="ml-4 mt-0.5">
                    {folderThreads.length === 0 ? (
                      <button
                        onClick={() => onNewThread(folder.id)}
                        className="w-full rounded px-2 py-1 text-left text-muted-foreground transition-colors hover:bg-surface-raised/60 hover:text-foreground"
                      >
                        + New chat
                      </button>
                    ) : (
                      folderThreads.map((thread) => (
                        <ThreadItem
                          key={thread.id}
                          thread={thread}
                          isActive={activeThreadId === thread.id}
                          isRenaming={renamingThreadId === thread.id}
                          renameValue={renamingThreadName}
                          renameInputRef={renameThreadInputRef}
                          onRenameChange={setRenamingThreadName}
                          onRenameConfirm={handleConfirmRenameThread}
                          onRenameCancel={handleCancelRenameThread}
                          onClick={() => onSelectThread(thread.id)}
                          onDelete={() => onDeleteThread(thread.id)}
                          onArchive={() => onArchiveThread(thread.id)}
                          onStartRename={() => handleStartRenameThread(thread.id, thread.title)}
                          onContextMenu={(e) => handleContextMenu(e, "thread", thread.id)}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {looseThreads.length > 0 && folders.length > 0 && (
            <div className="mx-1 my-1 border-t border-border" />
          )}
          <div className="min-h-[4px] rounded">
            {looseThreads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={activeThreadId === thread.id}
                isRenaming={renamingThreadId === thread.id}
                renameValue={renamingThreadName}
                renameInputRef={renameThreadInputRef}
                onRenameChange={setRenamingThreadName}
                onRenameConfirm={handleConfirmRenameThread}
                onRenameCancel={handleCancelRenameThread}
                onClick={() => onSelectThread(thread.id)}
                onDelete={() => onDeleteThread(thread.id)}
                onArchive={() => onArchiveThread(thread.id)}
                onStartRename={() => handleStartRenameThread(thread.id, thread.title)}
                onContextMenu={(e) => handleContextMenu(e, "thread", thread.id)}
              />
            ))}
          </div>
        </div>
        </div>

        <div className="border-t border-border p-2">
          <button
            onClick={onOpenSettings}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </div>

        {contextMenu && contextMenu.type === "folder" && (
          <div
            className="fixed z-50 min-w-32 rounded-md border border-border bg-surface py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                onSelectFolder(contextMenu.id);
                closeContextMenu();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-raised"
            >
              Open project
            </button>
            <button
              onClick={() => {
                onNewThread(contextMenu.id);
                closeContextMenu();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-raised"
            >
              New chat in project
            </button>
            <button
              onClick={() => {
                const folder = folders.find((f) => f.id === contextMenu.id);
                if (folder) handleStartRenameFolder(folder.id, folder.name);
                closeContextMenu();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-raised"
            >
              Rename project
            </button>
            <button
              onClick={() => {
                onDeleteFolder(contextMenu.id);
                closeContextMenu();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-surface-raised"
            >
              Delete project
            </button>
          </div>
        )}

        {contextMenu && contextMenu.type === "thread" && (
          <div
            className="fixed z-50 min-w-40 rounded-md border border-border bg-surface py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                onSelectThread(contextMenu.id);
                closeContextMenu();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-raised"
            >
              Open chat
            </button>
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => {
                setMoveThreadId(contextMenu.id);
                setMoveSearch("");
                closeContextMenu();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-raised"
            >
              Move to project…
            </button>
            {(() => {
              const thread = threads.find((t) => t.id === contextMenu.id);
              if (thread?.folderId != null) {
                return (
                  <>
                    <div className="my-1 border-t border-border" />
                    <button
                      onClick={() => {
                        onMoveThread(contextMenu.id, null);
                        closeContextMenu();
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-surface-raised"
                    >
                      Move outside project
                    </button>
                  </>
                );
              }
              return null;
            })()}
          </div>
        )}

        {moveThreadId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
            onClick={() => setMoveThreadId(null)}
          >
            <div
              className="w-full max-w-sm rounded-lg border border-border bg-surface p-3 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Move to project
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Choose a project for this chat.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMoveThreadId(null)}
                  className="rounded p-1 text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              <div className="mb-2">
                <input
                  autoFocus
                  value={moveSearch}
                  onChange={(e) => setMoveSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full rounded-md bg-input px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-muted-foreground"
                />
              </div>
              <div className="max-h-52 overflow-y-auto rounded-md border border-border/60 bg-background/40">
                {folders
                  .filter((folder) =>
                    folder.name.toLowerCase().includes(moveSearch.toLowerCase()),
                  )
                  .map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        onMoveThread(moveThreadId, folder.id);
                        setMoveThreadId(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-raised"
                    >
                      <FolderIconRender
                        name={folder.icon}
                        color={folder.color}
                        size={14}
                        className="shrink-0"
                      />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))}
                {folders.length === 0 && (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground">
                    No projects yet. Create one from the sidebar.
                  </div>
                )}
              </div>
              {folders.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onMoveThread(moveThreadId, null);
                    setMoveThreadId(null);
                  }}
                  className="mt-2 block w-full rounded-md bg-surface-raised px-3 py-1.5 text-center text-[11px] text-muted-foreground hover:bg-surface"
                >
                  Remove from project
                </button>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
      />
    </svg>
  );
}

function ThreadItem({
  thread,
  isActive,
  isRenaming,
  renameValue,
  renameInputRef,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  onClick,
  onDelete,
  onArchive,
  onStartRename,
  onContextMenu,
}: {
  thread: ChatThread;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onRenameChange: (value: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onClick: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onStartRename: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const isEmpty = thread.messageCount === 0;
  return (
    <div
      onContextMenu={onContextMenu}
      className={`group flex w-full cursor-grab items-center gap-1 rounded px-2 py-1 text-left transition-colors active:cursor-grabbing select-none ${
        isActive
          ? "bg-surface-raised text-foreground"
          : "text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground"
      }`}
    >
      <button
        type="button"
        onClick={isRenaming ? undefined : onClick}
        className="min-w-0 flex-1 truncate text-left"
      >
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onRenameConfirm();
              if (e.key === "Escape") onRenameCancel();
            }}
            onBlur={onRenameConfirm}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded bg-input px-1 py-0 text-xs text-foreground outline-none focus:ring-1 focus:ring-muted-foreground"
          />
        ) : (
          <span className="truncate">{thread.title}</span>
        )}
      </button>
      {!isRenaming && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
            title="Rename"
            className="rounded p-0.5 text-muted-foreground hover:bg-surface-raised hover:text-foreground"
          >
            <Pencil size={12} />
          </button>
          {isEmpty ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete"
              className="rounded p-0.5 text-muted-foreground hover:bg-surface-raised hover:text-red-500"
            >
              <Trash2 size={12} />
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              title="Archive"
              className="rounded p-0.5 text-muted-foreground hover:bg-surface-raised hover:text-foreground"
            >
              <Archive size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
