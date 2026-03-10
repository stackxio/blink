import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatThread, Folder } from "@/layout/ChatLayout";

interface SidebarProps {
  folders: Folder[];
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: (folderId?: string | null) => void;
  onNewFolder: (name: string) => void;
  onToggleFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onMoveThread: (threadId: string, folderId: string | null) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onOpenSettings: () => void;
  onOpenSkills: () => void;
}

export default function Sidebar({
  folders,
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onNewFolder,
  onToggleFolder,
  onDeleteFolder,
  onDeleteThread,
  onMoveThread,
  onRenameFolder,
  onOpenSettings,
  onOpenSkills,
}: SidebarProps) {
  const [width, setWidth] = useState(260);
  const isResizing = useRef(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverLoose, setDragOverLoose] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingFolderName, setRenamingFolderName] = useState("");
  const renameFolderInputRef = useRef<HTMLInputElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const maxW = Math.min(320, window.innerWidth * 0.4);
      const newWidth = Math.min(maxW, Math.max(200, e.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "folder" | "thread";
    id: string;
  } | null>(null);

  const looseThreads = threads.filter((t) => t.folderId === null);

  function threadsInFolder(folderId: string) {
    return threads.filter((t) => t.folderId === folderId);
  }

  function handleContextMenu(
    e: React.MouseEvent,
    type: "folder" | "thread",
    id: string,
  ) {
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

  function handleConfirmCreateFolder() {
    const name = newFolderName.trim();
    if (name) onNewFolder(name);
    setIsCreatingFolder(false);
    setNewFolderName("");
  }

  function handleCancelCreateFolder() {
    setIsCreatingFolder(false);
    setNewFolderName("");
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

  // Drag and drop
  function handleDragStart(e: React.DragEvent, threadId: string) {
    e.dataTransfer.setData("text/plain", threadId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleFolderDragOver(e: React.DragEvent, folderId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId(folderId);
    setDragOverLoose(false);
  }

  function handleFolderDrop(e: React.DragEvent, folderId: string) {
    e.preventDefault();
    const threadId = e.dataTransfer.getData("text/plain");
    if (threadId) onMoveThread(threadId, folderId);
    setDragOverFolderId(null);
  }

  function handleLooseDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverLoose(true);
    setDragOverFolderId(null);
  }

  function handleLooseDrop(e: React.DragEvent) {
    e.preventDefault();
    const threadId = e.dataTransfer.getData("text/plain");
    if (threadId) onMoveThread(threadId, null);
    setDragOverLoose(false);
  }

  function handleDragLeave() {
    setDragOverFolderId(null);
    setDragOverLoose(false);
  }

  return (
    <div className="relative flex h-full shrink-0 overflow-hidden" style={{ width: Math.min(width, 280) }}>
    <aside
      className="flex h-full flex-1 flex-col bg-sidebar text-[13px]"
      onClick={closeContextMenu}
    >
      {/* New chat + actions */}
      <div className="flex items-center gap-1 p-2">
        <button
          onClick={() => onNewThread(null)}
          className="flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-surface-raised"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New chat
        </button>
        <button
          onClick={handleStartCreateFolder}
          title="New folder"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-surface-raised hover:text-neutral-300"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
        </button>
      </div>

      {/* Skills button */}
      <div className="px-2 pb-1">
        <button
          onClick={onOpenSkills}
          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-neutral-500 transition-colors hover:bg-surface-raised hover:text-neutral-300"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
          Skills
        </button>
      </div>

      <div className="mx-2 border-t border-neutral-800/60" />

      {/* Threads & folders */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {/* Inline folder creation */}
        {isCreatingFolder && (
          <div className="mb-1 flex items-center gap-1.5 rounded px-1.5 py-1">
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
              placeholder="Folder name..."
              className="flex-1 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:ring-1 focus:ring-neutral-600"
            />
          </div>
        )}

        {/* Folders */}
        {folders.map((folder) => {
          const folderThreads = threadsInFolder(folder.id);
          const isDragOver = dragOverFolderId === folder.id;
          const isRenaming = renamingFolderId === folder.id;

          return (
            <div
              key={folder.id}
              className="mb-0.5"
              onDragOver={(e) => handleFolderDragOver(e, folder.id)}
              onDrop={(e) => handleFolderDrop(e, folder.id)}
              onDragLeave={handleDragLeave}
            >
              <button
                onClick={() => onToggleFolder(folder.id)}
                onContextMenu={(e) => handleContextMenu(e, "folder", folder.id)}
                className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-surface-raised ${
                  isDragOver ? "bg-[#55aaff]/10 ring-1 ring-[#55aaff]/40" : ""
                }`}
              >
                <svg
                  className={`h-2.5 w-2.5 shrink-0 text-neutral-600 transition-transform ${folder.expanded ? "rotate-90" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <FolderIcon />
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
                    className="flex-1 rounded bg-neutral-800 px-1 py-0 text-xs text-neutral-200 outline-none focus:ring-1 focus:ring-neutral-600"
                  />
                ) : (
                  <span className="flex-1 truncate text-neutral-300">{folder.name}</span>
                )}
                <span className="text-neutral-600">{folderThreads.length}</span>
              </button>

              {folder.expanded && (
                <div className="ml-4 mt-0.5">
                  {folderThreads.length === 0 ? (
                    <button
                      onClick={() => onNewThread(folder.id)}
                      className="w-full rounded px-2 py-1 text-left text-neutral-600 transition-colors hover:bg-surface-raised/60 hover:text-neutral-400"
                    >
                      + New chat
                    </button>
                  ) : (
                    folderThreads.map((thread) => (
                      <ThreadItem
                        key={thread.id}
                        thread={thread}
                        isActive={activeThreadId === thread.id}
                        onClick={() => onSelectThread(thread.id)}
                        onContextMenu={(e) => handleContextMenu(e, "thread", thread.id)}
                        onDragStart={(e) => handleDragStart(e, thread.id)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Loose threads (no folder) */}
        {looseThreads.length > 0 && folders.length > 0 && (
          <div className="mx-1 my-1 border-t border-neutral-800/40" />
        )}
        <div
          onDragOver={handleLooseDragOver}
          onDrop={handleLooseDrop}
          onDragLeave={handleDragLeave}
          className={`min-h-[4px] rounded transition-colors ${dragOverLoose ? "bg-[#55aaff]/10 ring-1 ring-[#55aaff]/40" : ""}`}
        >
          {looseThreads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={activeThreadId === thread.id}
              onClick={() => onSelectThread(thread.id)}
              onContextMenu={(e) => handleContextMenu(e, "thread", thread.id)}
              onDragStart={(e) => handleDragStart(e, thread.id)}
            />
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="border-t border-neutral-800/60 p-2">
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-neutral-500 transition-colors hover:bg-surface-raised hover:text-neutral-300"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7 7 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a7 7 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a7 7 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a7 7 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-32 rounded-md border border-neutral-700 bg-neutral-900 py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === "folder" ? (
            <>
              <button
                onClick={() => {
                  onNewThread(contextMenu.id);
                  closeContextMenu();
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
              >
                New chat in folder
              </button>
              <button
                onClick={() => {
                  const folder = folders.find((f) => f.id === contextMenu.id);
                  if (folder) handleStartRenameFolder(folder.id, folder.name);
                  closeContextMenu();
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
              >
                Rename folder
              </button>
              <button
                onClick={() => {
                  onDeleteFolder(contextMenu.id);
                  closeContextMenu();
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-neutral-800"
              >
                Delete folder
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                onDeleteThread(contextMenu.id);
                closeContextMenu();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-neutral-800"
            >
              Delete chat
            </button>
          )}
        </div>
      )}
    </aside>
    {/* Resize handle */}
    <div
      onMouseDown={handleMouseDown}
      className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize border-r border-neutral-800 transition-colors hover:border-neutral-600"
    />
    </div>
  );
}

function FolderIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

function ThreadItem({
  thread,
  isActive,
  onClick,
  onContextMenu,
  onDragStart,
}: {
  thread: ChatThread;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex w-full cursor-grab items-center rounded px-2 py-1 text-left transition-colors active:cursor-grabbing ${
        isActive
          ? "bg-surface-raised text-neutral-100"
          : "text-neutral-400 hover:bg-surface-raised/60 hover:text-neutral-200"
      }`}
    >
      <span className="truncate">{thread.title}</span>
    </button>
  );
}
