import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SquarePen, FolderPlus, ListFilter, Clock, Archive, Settings, Pencil, Trash2, Folder, FolderOpen, LayoutGrid } from "lucide-react";
import type { ChatThread, Project } from "@/layout/ChatLayout";
import { FolderIconRender } from "@/lib/folder-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface SidebarProps {
  projects: Project[];
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onSelectProject: (projectId: string) => void;
  onNewThread: (projectId?: string | null) => void;
  onNewProject: (name: string, scopeMode?: string, rootPath?: string | null) => void;
  onToggleProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
  onMoveThread: (threadId: string, projectId: string | null) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onUpdateProjectAppearance?: (
    projectId: string,
    updates: { icon?: string; color?: string },
  ) => void;
  onOpenSettings: () => void;
  onOpenSkills: () => void;
  onToggleSidebar: () => void;
  onOpenAutomations: () => void;
}

export default function Sidebar({
  projects,
  threads,
  activeThreadId,
  onSelectThread,
  onSelectProject,
  onNewThread,
  onNewProject,
  onToggleProject,
  onDeleteProject,
  onDeleteThread,
  onArchiveThread,
  onMoveThread,
  onRenameProject,
  onRenameThread,
  onOpenSettings,
  onOpenSkills,
  onToggleSidebar,
  onOpenAutomations,
}: SidebarProps) {
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectRoot, setNewProjectRoot] = useState<string | null>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const [renameModal, setRenameModal] = useState<{ type: "thread" | "project"; id: string; currentName: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [moveThreadId, setMoveThreadId] = useState<string | null>(null);
  const [moveSearch, setMoveSearch] = useState("");
  const [, forceUpdate] = useState(0);

  // Refresh relative timestamps every minute
  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const looseThreads = threads.filter((t) => t.projectId === null);

  function threadsInProject(projectId: string) {
    return threads.filter((t) => t.projectId === projectId);
  }

  // Project creation
  function handleStartCreateProject() {
    setIsCreatingProject(true);
    setNewProjectName("");
  }

  async function handlePickDirectory() {
    try {
      const path = await invoke<string | null>("pick_directory");
      if (path != null) setNewProjectRoot(path);
    } catch {
      // user cancelled or error
    }
  }

  function handleConfirmCreateProject() {
    const name = newProjectName.trim();
    if (name) {
      onNewProject(name, newProjectRoot ? "directory" : "system", newProjectRoot);
    }
    setIsCreatingProject(false);
    setNewProjectName("");
    setNewProjectRoot(null);
  }

  function handleCancelCreateProject() {
    setIsCreatingProject(false);
    setNewProjectName("");
    setNewProjectRoot(null);
  }

  useEffect(() => {
    if (isCreatingProject) projectInputRef.current?.focus();
  }, [isCreatingProject]);

  useEffect(() => {
    if (!isCreatingProject) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleCancelCreateProject();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCreatingProject]);

  function openRename(type: "thread" | "project", id: string, currentName: string) {
    setRenameModal({ type, id, currentName });
    setRenameValue(currentName);
  }

  function confirmRename() {
    const name = renameValue.trim();
    if (!name || !renameModal) return;
    if (renameModal.type === "thread") onRenameThread(renameModal.id, name);
    else onRenameProject(renameModal.id, name);
    setRenameModal(null);
  }

  useEffect(() => {
    if (renameModal) setTimeout(() => renameInputRef.current?.select(), 50);
  }, [renameModal]);

  return (
    <div className="relative flex h-full min-h-0 w-[260px] shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar text-[13px] text-foreground">
      <aside className="flex h-full min-h-0 flex-1 flex-col">
        {/* Top nav items */}
        <nav className="flex flex-col gap-0.5 px-2 pb-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNewThread(null)}
            className="h-auto w-full justify-start gap-2 px-2 py-1 font-normal text-[13px] text-foreground hover:bg-surface-raised hover:text-foreground"
          >
            <SquarePen size={15} />
            New thread
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenAutomations}
            className="h-auto w-full justify-start gap-2 px-2 py-1 font-normal text-[13px] text-foreground hover:bg-surface-raised hover:text-foreground"
          >
            <Clock size={15} />
            Automations
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSkills}
            className="h-auto w-full justify-start gap-2 px-2 py-1 font-normal text-[13px] text-foreground hover:bg-surface-raised hover:text-foreground"
          >
            <LayoutGrid size={15} />
            Skills
          </Button>
        </nav>

        <div className="mx-3 border-t border-border" />

        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-1 px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Threads
            </span>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStartCreateProject}
                title="New project"
                className="h-6 w-6 text-muted-foreground hover:bg-surface-raised hover:text-foreground"
              >
                <FolderPlus size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Filter or sort"
                className="h-6 w-6 text-muted-foreground hover:bg-surface-raised hover:text-foreground"
              >
                <ListFilter size={14} />
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {/* New project dialog */}
            <Dialog open={isCreatingProject} onOpenChange={(open) => !open && handleCancelCreateProject()}>
              <DialogContent className="w-full max-w-sm p-3" showCloseButton>
                <DialogHeader>
                  <DialogTitle id="new-project-title" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    New project
                  </DialogTitle>
                  <DialogDescription className="text-[11px] text-muted-foreground">
                    Name and optional folder scope.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Input
                    id="new-project-name"
                    ref={projectInputRef}
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleConfirmCreateProject();
                      }
                    }}
                    placeholder="Project name…"
                    className="h-8 px-2 py-1.5 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePickDirectory}
                    className="w-full justify-start gap-2 border-border/60 bg-background/40 px-3 py-1.5 text-xs hover:bg-surface-raised"
                  >
                    <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {newProjectRoot ? newProjectRoot : "Choose directory…"}
                    </span>
                  </Button>
                  {newProjectRoot && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setNewProjectRoot(null)}
                      className="w-full justify-start text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Use entire system instead
                    </Button>
                  )}
                </div>
                <DialogFooter className="mt-3 gap-1.5">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary" size="sm" onClick={handleCancelCreateProject}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleConfirmCreateProject}
                    disabled={!newProjectName.trim()}
                  >
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {projects.map((project) => {
              const projectThreads = threadsInProject(project.id);

              return (
                <ContextMenu key={project.id}>
                  <ContextMenuTrigger asChild>
                    <div className="mb-0.5 w-full">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggleProject(project.id)}
                        className="flex w-full min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-surface-raised"
                      >
                        {project.expanded ? (
                          <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
                        ) : (
                          <Folder size={14} className="shrink-0 text-muted-foreground" />
                        )}
                        <span className="flex-1 truncate text-foreground">{project.name}</span>
                        <span className="shrink-0 text-muted-foreground">{projectThreads.length}</span>
                      </Button>

                      {project.expanded && (
                        <div className="mt-0.5">
                          {projectThreads.length === 0 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onNewThread(project.id)}
                              className="w-full justify-start px-2 py-1 text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground"
                            >
                              + New chat
                            </Button>
                          ) : (
                            projectThreads.map((thread) => (
                              <ContextMenu key={thread.id}>
                                <ContextMenuTrigger asChild>
                                  <span className="block w-full">
                                    <ThreadItem
                                      thread={thread}
                                      isActive={activeThreadId === thread.id}
                                      onClick={() => onSelectThread(thread.id)}
                                      onDelete={() => onDeleteThread(thread.id)}
                                      onArchive={() => onArchiveThread(thread.id)}
                                      onStartRename={() => openRename("thread", thread.id, thread.title)}
                                    />
                                  </span>
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                  <ContextMenuItem onSelect={() => onSelectThread(thread.id)}>
                                    Open chat
                                  </ContextMenuItem>
                                  <ContextMenuItem onSelect={() => openRename("thread", thread.id, thread.title)}>
                                    Rename
                                  </ContextMenuItem>
                                  <ContextMenuSeparator />
                                  <ContextMenuItem
                                    onSelect={() => {
                                      setMoveThreadId(thread.id);
                                      setMoveSearch("");
                                    }}
                                  >
                                    Move to project…
                                  </ContextMenuItem>
                                  {thread.projectId != null && (
                                    <>
                                      <ContextMenuSeparator />
                                      <ContextMenuItem onSelect={() => onMoveThread(thread.id, null)}>
                                        Move outside project
                                      </ContextMenuItem>
                                    </>
                                  )}
                                </ContextMenuContent>
                              </ContextMenu>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => onSelectProject(project.id)}>Open project</ContextMenuItem>
                    <ContextMenuItem onSelect={() => onNewThread(project.id)}>New chat in project</ContextMenuItem>
                    <ContextMenuItem onSelect={() => openRename("project", project.id, project.name)}>
                      Rename project
                    </ContextMenuItem>
                    <ContextMenuItem variant="destructive" onSelect={() => onDeleteProject(project.id)}>
                      Delete project
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}

            {looseThreads.length > 0 && projects.length > 0 && (
              <div className="mx-1 my-1 border-t border-border" />
            )}
            <div className="min-h-[4px] rounded">
              {looseThreads.map((thread) => (
                <ContextMenu key={thread.id}>
                  <ContextMenuTrigger asChild>
                    <span className="block w-full">
                      <ThreadItem
                        thread={thread}
                        isActive={activeThreadId === thread.id}
                        onClick={() => onSelectThread(thread.id)}
                        onDelete={() => onDeleteThread(thread.id)}
                        onArchive={() => onArchiveThread(thread.id)}
                        onStartRename={() => openRename("thread", thread.id, thread.title)}
                      />
                    </span>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => onSelectThread(thread.id)}>Open chat</ContextMenuItem>
                    <ContextMenuItem onSelect={() => openRename("thread", thread.id, thread.title)}>
                      Rename
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onSelect={() => {
                        setMoveThreadId(thread.id);
                        setMoveSearch("");
                      }}
                    >
                      Move to project…
                    </ContextMenuItem>
                    {thread.projectId != null && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => onMoveThread(thread.id, null)}>
                          Move outside project
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
            className="w-full justify-start gap-2 px-2 py-1.5 text-muted-foreground hover:bg-surface-raised hover:text-foreground"
          >
            <Settings size={16} />
            <span>Settings</span>
          </Button>
        </div>

        {/* Move to project dialog */}
        <Dialog open={!!moveThreadId} onOpenChange={(open) => !open && setMoveThreadId(null)}>
          <DialogContent className="w-full max-w-sm p-3" showCloseButton>
            <DialogHeader>
              <DialogTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Move to project
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground">
                Choose a project for this chat.
              </DialogDescription>
            </DialogHeader>
            <div className="mb-2">
              <Input
                autoFocus
                value={moveSearch}
                onChange={(e) => setMoveSearch(e.target.value)}
                placeholder="Search projects…"
                className="h-8 px-2 py-1.5 text-xs"
              />
            </div>
            <div className="max-h-52 overflow-y-auto rounded-md border border-border/60 bg-background/40">
              {projects
                .filter((project) =>
                  project.name.toLowerCase().includes(moveSearch.toLowerCase()),
                )
                .map((project) => (
                  <Button
                    key={project.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (moveThreadId) {
                        onMoveThread(moveThreadId, project.id);
                        setMoveThreadId(null);
                      }
                    }}
                    className="w-full justify-start gap-2 px-3 py-1.5 text-xs hover:bg-surface-raised"
                  >
                    <FolderIconRender
                      name={project.icon}
                      color={project.color}
                      size={14}
                      className="shrink-0"
                    />
                    <span className="truncate">{project.name}</span>
                  </Button>
                ))}
              {projects.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-muted-foreground">
                  No projects yet. Create one from the sidebar.
                </div>
              )}
            </div>
            {projects.length > 0 && moveThreadId && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2 w-full"
                onClick={() => {
                  onMoveThread(moveThreadId, null);
                  setMoveThreadId(null);
                }}
              >
                Remove from project
              </Button>
            )}
          </DialogContent>
        </Dialog>

        {/* Rename dialog */}
        <Dialog open={!!renameModal} onOpenChange={(open) => !open && setRenameModal(null)}>
          <DialogContent className="w-full max-w-sm p-3" showCloseButton>
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold text-foreground">
                {renameModal?.type === "thread" ? "Rename thread" : "Rename project"}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground">
                Keep it short and recognizable.
              </DialogDescription>
            </DialogHeader>
            <Input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmRename();
                }
                if (e.key === "Escape") setRenameModal(null);
              }}
              className="h-9 px-3 text-sm"
            />
            <DialogFooter className="mt-2 gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                size="sm"
                onClick={confirmRename}
                disabled={!renameValue.trim() || renameValue.trim() === renameModal?.currentName}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </aside>
    </div>
  );
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins < 1 ? "now" : `${mins}m`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

function ThreadItem({
  thread,
  isActive,
  onClick,
  onDelete,
  onArchive,
  onStartRename,
}: {
  thread: ChatThread;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onStartRename: () => void;
}) {
  const isEmpty = thread.messageCount === 0;
  return (
    <div
      className={`group relative flex w-full cursor-grab items-center gap-1 rounded px-2 py-1 text-left transition-colors active:cursor-grabbing select-none ${
        isActive
          ? "bg-surface-raised text-foreground"
          : "text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="min-w-0 flex-1 truncate text-left text-[13px]"
      >
        {thread.title}
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <span className="text-[11px] text-muted-foreground/60 transition-opacity group-hover:opacity-0">
          {relativeTime(thread.createdAt)}
        </span>
        <div className="absolute right-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
            title="Rename"
            className="h-6 w-6 rounded p-0.5 text-muted-foreground hover:bg-surface-raised hover:text-foreground"
          >
            <Pencil size={12} />
          </Button>
          {isEmpty ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete"
              className="h-6 w-6 rounded p-0.5 text-muted-foreground hover:bg-surface-raised hover:text-destructive"
            >
              <Trash2 size={12} />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              title="Archive"
              className="h-6 w-6 rounded p-0.5 text-muted-foreground hover:bg-surface-raised hover:text-foreground"
            >
              <Archive size={12} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
