import { useState, useCallback, useEffect, useRef } from "react";
import { Outlet, useNavigate, useParams } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { PanelLeftOpen } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import StatusBar from "@/components/StatusBar";

export interface ChatThread {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: Date;
  messageCount: number;
}

export interface Folder {
  id: string;
  name: string;
  expanded: boolean;
  icon: string;
  color: string;
  rootPath: string | null;
  scopeMode: string;
}

interface DbFolder {
  id: string;
  name: string;
  position: number;
  root_path?: string | null;
  scope_mode?: string;
  icon?: string;
  color?: string;
  created_at: string;
  updated_at?: string;
}

interface DbThread {
  id: string;
  folder_id: string | null;
  title: string;
  root_path_override?: string | null;
  scope_mode_override?: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

function dbFolderToFolder(db: DbFolder): Folder {
  return {
    id: db.id,
    name: db.name,
    expanded: true,
    icon: db.icon ?? "Folder",
    color: db.color ?? "#6b7280",
    rootPath: db.root_path ?? null,
    scopeMode: db.scope_mode ?? "system",
  };
}

function dbThreadToThread(db: DbThread): ChatThread {
  return {
    id: db.id,
    title: db.title,
    folderId: db.folder_id,
    createdAt: new Date(db.created_at),
    messageCount: db.message_count ?? 0,
  };
}

export default function ChatLayout() {
  const [isLoading, setIsLoading] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const params = useParams();
  const activeThreadId = params.threadId ?? null;
  const pendingFolderIdRef = useRef<string | null>(null);

  // Cmd+B to toggle sidebar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load folders and threads from db on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [dbFolders, dbThreads] = await Promise.all([
          invoke<DbFolder[]>("list_folders"),
          invoke<DbThread[]>("list_threads"),
        ]);
        setFolders(dbFolders.map(dbFolderToFolder));
        setThreads(dbThreads.map(dbThreadToThread));
      } catch {
        // db may not be ready yet — start with empty state
      }
    }

    loadData();
  }, []);

  const handleLoadingChange = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  async function handleNewThread(folderId?: string | null) {
    pendingFolderIdRef.current = folderId ?? null;
    navigate("/chat");
  }

  async function createThread(
    folderId?: string | null,
    scopeModeOverride?: string | null,
    rootPathOverride?: string | null,
  ): Promise<ChatThread> {
    const dbThread = await invoke<DbThread>("create_thread", {
      folderId: folderId ?? null,
      title: "New chat",
      scopeModeOverride: scopeModeOverride ?? null,
      rootPathOverride: rootPathOverride ?? null,
    });
    const thread = dbThreadToThread(dbThread);
    setThreads((prev) => [thread, ...prev]);
    navigate(`/chat/${thread.id}`);
    return thread;
  }

  async function handleNewFolder(
    name: string,
    scopeMode?: string,
    rootPath?: string | null,
  ) {
    try {
      const dbFolder = await invoke<DbFolder>("create_folder", {
        name,
        scopeMode: scopeMode ?? "system",
        rootPath: rootPath ?? null,
      });
      setFolders((prev) => [...prev, dbFolderToFolder(dbFolder)]);
    } catch {
      setFolders((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name,
          expanded: true,
          icon: "Folder",
          color: "#6b7280",
          rootPath: rootPath ?? null,
          scopeMode: scopeMode ?? "system",
        },
      ]);
    }
  }

  function handleToggleFolder(folderId: string) {
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, expanded: !f.expanded } : f)),
    );
  }

  async function handleDeleteFolder(folderId: string) {
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setThreads((prev) => prev.map((t) => (t.folderId === folderId ? { ...t, folderId: null } : t)));

    try {
      await invoke("delete_folder", { id: folderId });
    } catch {
      // Already removed from UI
    }
  }

  async function handleDeleteThread(threadId: string) {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (activeThreadId === threadId) navigate("/");

    try {
      await invoke("delete_thread", { id: threadId });
    } catch {
      // Already removed from UI
    }
  }

  async function handleArchiveThread(threadId: string) {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (activeThreadId === threadId) navigate("/");

    try {
      await invoke("archive_thread", { id: threadId });
    } catch {
      // Already removed from UI
    }
  }

  async function handleRenameThread(threadId: string, title: string) {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, title } : t)));

    try {
      await invoke("update_thread_title", { id: threadId, title });
    } catch {
      // Already updated in UI
    }
  }

  async function handleMoveThread(threadId: string, folderId: string | null) {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, folderId } : t)));

    try {
      await invoke("move_thread_to_folder", { id: threadId, folderId });
    } catch {
      // Already updated in UI
    }
  }

  async function handleRenameFolder(folderId: string, name: string) {
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name } : f)));

    try {
      await invoke("rename_folder", { id: folderId, name });
    } catch {
      // Already updated in UI
    }
  }

  async function handleUpdateFolderAppearance(
    folderId: string,
    updates: { icon?: string; color?: string },
  ) {
    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId
          ? {
              ...f,
              icon: updates.icon ?? f.icon,
              color: updates.color ?? f.color,
            }
          : f,
      ),
    );
    try {
      await invoke("update_folder_appearance", {
        id: folderId,
        icon: updates.icon ?? null,
        color: updates.color ?? null,
      });
    } catch {
      // Already updated in UI
    }
  }

  return (
    <div className="flex h-full min-h-0 text-foreground">
      {/* Sidebar wrapper: slide animation via width + overflow */}
      <div
        className={`flex shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-out ${
          sidebarOpen ? "w-[260px]" : "w-0"
        }`}
      >
        <Sidebar
          folders={folders}
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={(id) => navigate(`/chat/${id}`)}
          onSelectFolder={(id) => navigate(`/project/${id}`)}
          onNewThread={handleNewThread}
          onNewFolder={handleNewFolder}
          onToggleFolder={handleToggleFolder}
          onDeleteFolder={handleDeleteFolder}
          onDeleteThread={handleDeleteThread}
          onArchiveThread={handleArchiveThread}
          onMoveThread={handleMoveThread}
          onRenameFolder={handleRenameFolder}
          onRenameThread={handleRenameThread}
          onUpdateFolderAppearance={handleUpdateFolderAppearance}
          onOpenSettings={() => navigate("/settings")}
          onToggleSidebar={() => setSidebarOpen(false)}
          onOpenAutomations={() => navigate("/automations")}
        />
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background transition-[margin] duration-200 ease-out">
        <div className="titlebar-drag relative h-12 shrink-0">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              title="Show sidebar (Cmd+B)"
              className="titlebar-no-drag absolute left-2 top-3 z-20 flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <PanelLeftOpen size={14} />
            </button>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet
            context={{
              onLoadingChange: handleLoadingChange,
              onRenameThread: handleRenameThread,
              onNewThread: handleNewThread,
              createThread,
              pendingFolderIdRef,
              activeThreadId,
              folders,
              threads,
              onSelectThread: (id: string) => navigate(`/chat/${id}`),
              onUpdateFolderAppearance: handleUpdateFolderAppearance,
            }}
          />
        </div>
        <StatusBar isLoading={isLoading} />
      </div>
    </div>
  );
}
