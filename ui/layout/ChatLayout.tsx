import { useState, useCallback } from "react";
import { Outlet, useNavigate, useParams } from "react-router";
import Sidebar from "@/components/Sidebar";
import StatusBar from "@/components/StatusBar";

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

export default function ChatLayout() {
  const [isLoading, setIsLoading] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const navigate = useNavigate();
  const params = useParams();
  const activeThreadId = params.threadId ?? null;

  const handleLoadingChange = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  function handleNewThread(folderId?: string | null) {
    const id = crypto.randomUUID();
    setThreads((prev) => [
      { id, title: "New chat", folderId: folderId ?? null, createdAt: new Date() },
      ...prev,
    ]);
    navigate(`/chat/${id}`);
  }

  function handleNewFolder() {
    const name = prompt("Folder name:");
    if (!name?.trim()) return;
    setFolders((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: name.trim(), expanded: true },
    ]);
  }

  function handleToggleFolder(folderId: string) {
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, expanded: !f.expanded } : f)),
    );
  }

  function handleDeleteFolder(folderId: string) {
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setThreads((prev) =>
      prev.map((t) => (t.folderId === folderId ? { ...t, folderId: null } : t)),
    );
  }

  function handleDeleteThread(threadId: string) {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (activeThreadId === threadId) navigate("/");
  }

  function handleRenameThread(threadId: string, title: string) {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, title } : t)));
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-100">
      <div className="flex min-h-0 flex-1">
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
          onOpenSettings={() => navigate("/settings")}
        />
        <Outlet
          context={{
            onLoadingChange: handleLoadingChange,
            onRenameThread: handleRenameThread,
            activeThreadId,
          }}
        />
      </div>
      <StatusBar isLoading={isLoading} />
    </div>
  );
}
