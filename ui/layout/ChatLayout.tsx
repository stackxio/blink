import React, { useState, useCallback, useEffect, useRef } from "react";
import { Outlet, useNavigate, useParams } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { PanelLeftOpen, PanelLeftClose } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import StatusBar from "@/components/StatusBar";

export interface ChatThread {
  id: string;
  title: string;
  projectId: string | null;
  createdAt: Date;
  messageCount: number;
}

/** UI model for a project (backend still uses "folder" in DB and invoke names). */
export interface Project {
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

function dbFolderToProject(db: DbFolder): Project {
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
    projectId: db.folder_id,
    createdAt: new Date(db.created_at),
    messageCount: db.message_count ?? 0,
  };
}

export default function ChatLayout() {
  const [isLoading, setIsLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [headerExtra, setHeaderExtra] = useState<React.ReactNode>(null);
  const navigate = useNavigate();
  const params = useParams();
  const activeThreadId = params.threadId ?? null;
  const pendingProjectIdRef = useRef<string | null>(null);

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

  // Load projects and threads from db on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [dbFolders, dbThreads] = await Promise.all([
          invoke<DbFolder[]>("list_folders"),
          invoke<DbThread[]>("list_threads"),
        ]);
        setProjects(dbFolders.map(dbFolderToProject));
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

  async function handleNewThread(projectId?: string | null) {
    pendingProjectIdRef.current = projectId ?? null;
    navigate("/chat");
  }

  async function createThread(
    projectId?: string | null,
    scopeModeOverride?: string | null,
    rootPathOverride?: string | null,
  ): Promise<ChatThread> {
    const dbThread = await invoke<DbThread>("create_thread", {
      folderId: projectId ?? null,
      title: "New chat",
      scopeModeOverride: scopeModeOverride ?? null,
      rootPathOverride: rootPathOverride ?? null,
    });
    const thread = dbThreadToThread(dbThread);
    setThreads((prev) => [thread, ...prev]);
    navigate(`/chat/${thread.id}`);
    return thread;
  }

  async function handleNewProject(
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
      setProjects((prev) => [...prev, dbFolderToProject(dbFolder)]);
    } catch {
      setProjects((prev) => [
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

  function handleToggleProject(projectId: string) {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, expanded: !p.expanded } : p)),
    );
  }

  async function handleDeleteProject(projectId: string) {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setThreads((prev) => prev.map((t) => (t.projectId === projectId ? { ...t, projectId: null } : t)));

    try {
      await invoke("delete_folder", { id: projectId });
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

  async function handleMoveThread(threadId: string, projectId: string | null) {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, projectId } : t)));

    try {
      await invoke("move_thread_to_folder", { id: threadId, folderId: projectId });
    } catch {
      // Already updated in UI
    }
  }

  async function handleRenameProject(projectId: string, name: string) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, name } : p)));

    try {
      await invoke("rename_folder", { id: projectId, name });
    } catch {
      // Already updated in UI
    }
  }

  async function handleUpdateProjectAppearance(
    projectId: string,
    updates: { icon?: string; color?: string },
  ) {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              icon: updates.icon ?? p.icon,
              color: updates.color ?? p.color,
            }
          : p,
      ),
    );
    try {
      await invoke("update_folder_appearance", {
        id: projectId,
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
          projects={projects}
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={(id) => navigate(`/chat/${id}`)}
          onSelectProject={(id) => navigate(`/project/${id}`)}
          onNewThread={handleNewThread}
          onNewProject={handleNewProject}
          onToggleProject={handleToggleProject}
          onDeleteProject={handleDeleteProject}
          onDeleteThread={handleDeleteThread}
          onArchiveThread={handleArchiveThread}
          onMoveThread={handleMoveThread}
          onRenameProject={handleRenameProject}
          onRenameThread={handleRenameThread}
          onUpdateProjectAppearance={handleUpdateProjectAppearance}
          onOpenSettings={() => navigate("/settings")}
          onOpenSkills={() => navigate("/settings/skills")}
          onToggleSidebar={() => setSidebarOpen(false)}
          onOpenAutomations={() => navigate("/automations")}
        />
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background transition-[margin] duration-200 ease-out">
        {/* Single compact header: drag region, centered target, sidebar toggle */}
        <header className="titlebar-drag grid h-7 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-surface/50 px-2">
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              title="Toggle sidebar (Cmd+B)"
              className="titlebar-no-drag flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
          </div>
          {headerExtra && (
            <div className="titlebar-no-drag text-center text-[11px] text-muted-foreground">
              {headerExtra}
            </div>
          )}
          <div className="min-w-0" />
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet
            context={{
              onLoadingChange: handleLoadingChange,
              onRenameThread: handleRenameThread,
              onNewThread: handleNewThread,
              createThread,
              pendingProjectIdRef,
              activeThreadId,
              projects,
              threads,
              onSelectThread: (id: string) => navigate(`/chat/${id}`),
              onUpdateProjectAppearance: handleUpdateProjectAppearance,
              setHeaderExtra,
            }}
          />
        </div>
        <StatusBar isLoading={isLoading} />
      </div>
    </div>
  );
}
