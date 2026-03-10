import { useState, useCallback, useEffect } from "react";
import { Outlet, useNavigate, useParams } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { PanelLeftOpen } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import StatusBar from "@/components/StatusBar";
import { useTheme } from "@/lib/theme";

export interface ChatThread {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: Date;
}

export interface Folder {
  id: string;
  name: string;
  expanded: boolean;
}

interface DbFolder {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

interface DbThread {
  id: string;
  folder_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

function dbFolderToFolder(db: DbFolder): Folder {
  return { id: db.id, name: db.name, expanded: true };
}

function dbThreadToThread(db: DbThread): ChatThread {
  return {
    id: db.id,
    title: db.title,
    folderId: db.folder_id,
    createdAt: new Date(db.created_at),
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
  useTheme();

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
    try {
      const dbThread = await invoke<DbThread>("create_thread", {
        folderId: folderId ?? null,
        title: "New chat",
      });
      const thread = dbThreadToThread(dbThread);
      setThreads((prev) => [thread, ...prev]);
      navigate(`/chat/${thread.id}`);
    } catch {
      // Fallback to local-only if db fails
      const id = crypto.randomUUID();
      setThreads((prev) => [
        { id, title: "New chat", folderId: folderId ?? null, createdAt: new Date() },
        ...prev,
      ]);
      navigate(`/chat/${id}`);
    }
  }

  async function handleNewFolder(name: string) {
    try {
      const dbFolder = await invoke<DbFolder>("create_folder", { name });
      setFolders((prev) => [...prev, dbFolderToFolder(dbFolder)]);
    } catch {
      // Fallback to local-only
      setFolders((prev) => [
        ...prev,
        { id: crypto.randomUUID(), name, expanded: true },
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
    setThreads((prev) =>
      prev.map((t) => (t.folderId === folderId ? { ...t, folderId: null } : t)),
    );

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

  return (
    <div className="flex h-full flex-col bg-background text-neutral-100">
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <Sidebar
            folders={folders}
            threads={threads}
            activeThreadId={activeThreadId}
            onSelectThread={(id) => navigate(`/chat/${id}`)}
            onNewThread={handleNewThread}
            onNewFolder={handleNewFolder}
            onToggleFolder={handleToggleFolder}
            onDeleteFolder={handleDeleteFolder}
            onDeleteThread={handleDeleteThread}
            onMoveThread={handleMoveThread}
            onRenameFolder={handleRenameFolder}
            onOpenSettings={() => navigate("/settings")}
            onToggleSidebar={() => setSidebarOpen(false)}
          />
        )}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            title="Show sidebar (Cmd+B)"
            className="absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-surface-raised hover:text-neutral-300"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
        <Outlet
          context={{
            onLoadingChange: handleLoadingChange,
            onRenameThread: handleRenameThread,
            onNewThread: handleNewThread,
            activeThreadId,
          }}
        />
      </div>
      <StatusBar isLoading={isLoading} />
    </div>
  );
}
