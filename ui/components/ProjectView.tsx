import { useState, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router";
import { Plus } from "lucide-react";
import { FolderIconRender, FOLDER_ICON_NAMES, FOLDER_COLORS } from "@/lib/folder-icons";
import type { ChatThread, Folder } from "@/layout/ChatLayout";

interface ProjectOutletContext {
  folders: Folder[];
  threads: ChatThread[];
  onNewThread: (folderId: string | null) => Promise<void>;
  onSelectThread: (id: string) => void;
  onUpdateFolderAppearance: (
    folderId: string,
    updates: { icon?: string; color?: string },
  ) => Promise<void>;
}

export default function ProjectView() {
  const { folders, threads, onNewThread, onSelectThread, onUpdateFolderAppearance } =
    useOutletContext<ProjectOutletContext>();
  const { folderId } = useParams<{ folderId: string }>();
  const navigate = useNavigate();
  const folder = folders.find((f) => f.id === folderId);
  const projectThreads = threads.filter((t) => t.folderId === folderId);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  useEffect(() => {
    if (folderId && !folder) {
      navigate("/");
    }
  }, [folderId, folder, navigate]);

  if (!folder) return null;

  async function handleNewChatInProject() {
    if (!folder) return;
    await onNewThread(folder.id);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 border-b border-neutral-800/60 px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowIconPicker((v) => !v)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-surface-raised"
                style={{ backgroundColor: `${folder.color}20`, color: folder.color }}
              >
                <FolderIconRender name={folder.icon} color={folder.color} size={24} />
              </button>
              {showIconPicker && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowIconPicker(false)}
                    aria-hidden
                  />
                  <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-52 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-2 shadow-lg">
                    <div className="grid grid-cols-5 gap-1">
                      {FOLDER_ICON_NAMES.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            onUpdateFolderAppearance(folder.id, { icon: name });
                            setShowIconPicker(false);
                          }}
                          className="flex items-center justify-center rounded p-1.5 transition-colors hover:bg-surface-raised"
                          style={{ color: folder.color }}
                        >
                          <FolderIconRender name={name} color={folder.color} size={18} />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="relative min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold text-neutral-100">{folder.name}</h1>
              <p className="text-xs text-neutral-500">Project</p>
              {folder.scopeMode === "system" || !folder.rootPath ? (
                <p className="mt-1 text-xs text-amber-600/90" title="This project can operate across the entire system">
                  Target scope: entire system
                </p>
              ) : (
                <p className="mt-1 truncate text-xs text-neutral-500" title={folder.rootPath}>
                  Target: {folder.rootPath}
                </p>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColorPicker((v) => !v)}
                className="h-6 w-6 rounded-full border-2 border-neutral-600 transition-opacity hover:opacity-90"
                style={{ backgroundColor: folder.color }}
                title="Change color"
              />
              {showColorPicker && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowColorPicker(false)}
                    aria-hidden
                  />
                  <div className="absolute right-0 top-full z-50 mt-1 flex flex-wrap gap-1 rounded-lg border border-neutral-700 bg-neutral-900 p-2 shadow-lg">
                    {FOLDER_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => {
                          onUpdateFolderAppearance(folder.id, { color });
                          setShowColorPicker(false);
                        }}
                        className="h-6 w-6 rounded-full border-2 border-transparent transition-[border-color] hover:border-neutral-500"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewChatInProject}
            className="mt-4 flex w-full items-center gap-2 rounded-lg border border-neutral-700/80 bg-neutral-900/80 px-4 py-3 text-left text-sm text-neutral-400 transition-colors hover:border-neutral-600 hover:bg-neutral-800/80 hover:text-neutral-200"
          >
            <Plus size={16} />
            New chat in {folder.name}
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <div className="mb-3 border-b border-neutral-800/60">
            <span className="border-b-2 border-neutral-200 px-3 pb-2 text-sm font-medium text-neutral-100">
              Chats
            </span>
          </div>
          {projectThreads.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              No chats in this project yet. Start one with &quot;New chat in {folder.name}&quot; above.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {projectThreads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => onSelectThread(thread.id)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface-raised"
                  >
                    <span className="truncate text-neutral-200">{thread.title}</span>
                    <span className="shrink-0 pl-2 text-xs text-neutral-500">
                      {thread.createdAt.toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
