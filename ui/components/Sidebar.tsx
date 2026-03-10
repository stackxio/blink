import { useState } from "react";
import type { ChatThread, Folder } from "@/layout/ChatLayout";

interface SidebarProps {
  folders: Folder[];
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: (folderId?: string | null) => void;
  onNewFolder: () => void;
  onToggleFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onOpenSettings: () => void;
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
  onOpenSettings,
}: SidebarProps) {
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

  return (
    <aside
      className="flex h-full w-52 shrink-0 flex-col border-r border-neutral-800 bg-stone-950 text-xs"
      onClick={closeContextMenu}
    >
      {/* New chat + new folder */}
      <div className="flex items-center gap-1 p-2">
        <button
          onClick={() => onNewThread(null)}
          className="flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-stone-800"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New chat
        </button>
        <button
          onClick={onNewFolder}
          title="New folder"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-stone-800 hover:text-neutral-300"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            />
          </svg>
        </button>
      </div>

      <div className="mx-2 border-t border-neutral-800/60" />

      {/* Threads & folders */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {/* Folders */}
        {folders.map((folder) => {
          const folderThreads = threadsInFolder(folder.id);
          return (
            <div key={folder.id} className="mb-0.5">
              <button
                onClick={() => onToggleFolder(folder.id)}
                onContextMenu={(e) => handleContextMenu(e, "folder", folder.id)}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-stone-800"
              >
                <svg
                  className={`h-2.5 w-2.5 shrink-0 text-neutral-600 transition-transform ${folder.expanded ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <svg
                  className="h-3.5 w-3.5 shrink-0 text-neutral-500"
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
                <span className="flex-1 truncate text-neutral-300">{folder.name}</span>
                <span className="text-neutral-600">{folderThreads.length}</span>
              </button>

              {folder.expanded && (
                <div className="ml-4 mt-0.5">
                  {folderThreads.length === 0 ? (
                    <button
                      onClick={() => onNewThread(folder.id)}
                      className="w-full rounded px-2 py-1 text-left text-neutral-600 transition-colors hover:bg-stone-800/60 hover:text-neutral-400"
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
        {looseThreads.map((thread) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            isActive={activeThreadId === thread.id}
            onClick={() => onSelectThread(thread.id)}
            onContextMenu={(e) => handleContextMenu(e, "thread", thread.id)}
          />
        ))}
      </div>

      {/* Settings */}
      <div className="border-t border-neutral-800/60 p-2">
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-neutral-500 transition-colors hover:bg-stone-800 hover:text-neutral-300"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7 7 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a7 7 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a7 7 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a7 7 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
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
  );
}

function ThreadItem({
  thread,
  isActive,
  onClick,
  onContextMenu,
}: {
  thread: ChatThread;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex w-full items-center rounded px-2 py-1 text-left transition-colors ${
        isActive
          ? "bg-stone-800 text-neutral-100"
          : "text-neutral-400 hover:bg-stone-800/60 hover:text-neutral-200"
      }`}
    >
      <span className="truncate">{thread.title}</span>
    </button>
  );
}
