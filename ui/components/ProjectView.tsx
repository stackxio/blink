import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Pin, BookOpen } from "lucide-react";
import { FolderIconRender, FOLDER_ICON_NAMES, FOLDER_COLORS } from "@/lib/folder-icons";
import type { ChatThread, Project } from "@/layout/ChatLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProjectMemory {
  id: string;
  project_id: string;
  source_type: string;
  source_id: string | null;
  content: string;
  priority: number;
  created_at: string;
}

interface ProjectOutletContext {
  projects: Project[];
  threads: ChatThread[];
  onNewThread: (projectId: string | null) => Promise<void>;
  onSelectThread: (id: string) => void;
  onUpdateProjectAppearance: (
    projectId: string,
    updates: { icon?: string; color?: string },
  ) => Promise<void>;
}

export default function ProjectView() {
  const { projects, threads, onNewThread, onSelectThread, onUpdateProjectAppearance } =
    useOutletContext<ProjectOutletContext>();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = projects.find((p) => p.id === projectId);
  const projectThreads = threads.filter((t) => t.projectId === projectId);
  const [memories, setMemories] = useState<ProjectMemory[]>([]);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [pinText, setPinText] = useState("");

  const loadMemories = useCallback(async () => {
    if (!projectId) return;
    try {
      const list = await invoke<ProjectMemory[]>("list_project_memories", { projectId });
      setMemories(list);
    } catch {
      setMemories([]);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId && !project) {
      navigate("/");
    }
  }, [projectId, project, navigate]);

  useEffect(() => {
    if (projectId) loadMemories();
  }, [projectId, loadMemories]);

  if (!project) return null;

  async function handleNewChatInProject() {
    if (!project) return;
    await onNewThread(project.id);
  }

  async function handlePinMemory() {
    if (!project || !pinText.trim()) return;
    try {
      await invoke("pin_project_memory", { projectId: project.id, content: pinText.trim() });
      setPinText("");
      await loadMemories();
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 border-b border-neutral-800/60 px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-3">
            <DropdownMenu open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 shrink-0 rounded-xl hover:bg-surface-raised"
                  style={{ backgroundColor: `${project.color}20`, color: project.color }}
                >
                  <FolderIconRender name={project.icon} color={project.color} size={24} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-48 w-52 p-2">
                <div className="grid grid-cols-5 gap-1">
                  {FOLDER_ICON_NAMES.map((name) => (
                    <Button
                      key={name}
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded p-1.5 hover:bg-surface-raised"
                      style={{ color: project.color }}
                      onClick={() => {
                        onUpdateProjectAppearance(project.id, { icon: name });
                        setIconPickerOpen(false);
                      }}
                    >
                      <FolderIconRender name={name} color={project.color} size={18} />
                    </Button>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="relative min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold text-neutral-100">{project.name}</h1>
              <p className="text-xs text-neutral-500">Project</p>
              {project.scopeMode === "system" || !project.rootPath ? (
                <p className="mt-1 text-xs text-amber-600/90" title="This project can operate across the entire system">
                  Target scope: entire system
                </p>
              ) : (
                <p className="mt-1 truncate text-xs text-neutral-500" title={project.rootPath}>
                  Target: {project.rootPath}
                </p>
              )}
            </div>
            <DropdownMenu open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full border-2 border-border transition-opacity hover:opacity-90"
                  style={{ backgroundColor: project.color }}
                  title="Change color"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="flex flex-wrap gap-1 p-2">
                {FOLDER_COLORS.map((color) => (
                  <Button
                    key={color}
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full border-2 border-transparent hover:border-muted-foreground/50"
                    style={{ backgroundColor: color }}
                    title={color}
                    onClick={() => {
                      onUpdateProjectAppearance(project.id, { color });
                      setColorPickerOpen(false);
                    }}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full justify-start gap-2 border-border/80 bg-background/80 px-4 py-3 text-sm text-muted-foreground hover:border-border hover:bg-surface-raised hover:text-foreground"
            onClick={handleNewChatInProject}
          >
            <Plus size={16} />
            New chat in {project.name}
          </Button>
        </div>
      </div>

      <div className="flex-1 px-6 py-4">
        <div className="mx-auto max-w-2xl space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2 border-b border-neutral-800/60">
              <BookOpen size={16} className="text-neutral-500" />
              <span className="border-b-2 border-neutral-200 px-3 pb-2 text-sm font-medium text-neutral-100">
                Shared context
              </span>
            </div>
            <p className="mb-2 text-xs text-neutral-500">
              Pinned facts and recent chat summaries in this project are available to all chats here.
            </p>
            <div className="mb-3 flex gap-2">
              <Input
                type="text"
                value={pinText}
                onChange={(e) => setPinText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePinMemory()}
                placeholder="Pin a note for this project..."
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handlePinMemory}
                disabled={!pinText.trim()}
                className="gap-1.5"
              >
                <Pin size={14} />
                Pin
              </Button>
            </div>
            {memories.length === 0 ? (
              <p className="text-sm text-neutral-500">No shared context yet.</p>
            ) : (
              <ul className="space-y-2">
                {memories.slice(0, 20).map((m) => (
                  <li
                    key={m.id}
                    className="rounded-lg border border-neutral-800/60 bg-neutral-900/50 px-3 py-2 text-sm text-neutral-300"
                  >
                    <span className="text-xs text-neutral-500 capitalize">{m.source_type.replace(/_/g, " ")}</span>
                    <p className="mt-0.5 whitespace-pre-wrap break-words">{m.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-3 border-b border-neutral-800/60">
              <span className="border-b-2 border-neutral-200 px-3 pb-2 text-sm font-medium text-neutral-100">
                Chats
              </span>
            </div>
            {projectThreads.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-500">
                No chats in this project yet. Start one with &quot;New chat in {project.name}&quot; above.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {projectThreads.map((thread) => (
                  <li key={thread.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-raised"
                      onClick={() => onSelectThread(thread.id)}
                    >
                      <span className="truncate text-foreground">{thread.title}</span>
                      <span className="shrink-0 pl-2 text-xs text-muted-foreground">
                        {thread.createdAt.toLocaleDateString()}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
