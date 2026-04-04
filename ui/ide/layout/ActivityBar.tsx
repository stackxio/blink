import { Files, Search, GitBranch, History } from "lucide-react";
import { useAppStore, type SidePanelView } from "@/store";

const ITEMS: { id: SidePanelView; icon: typeof Files; label: string }[] = [
  { id: "explorer", icon: Files, label: "Explorer" },
  { id: "search", icon: Search, label: "Search" },
  { id: "git", icon: GitBranch, label: "Source Control" },
  { id: "history", icon: History, label: "Local History" },
];

export default function ActivityBar() {
  const ws = useAppStore((s) => s.activeWorkspace());
  const setSidePanelView = useAppStore((s) => s.setSidePanelView);
  const sidePanelView = ws?.sidePanelView ?? "explorer";
  const sidePanelOpen = ws?.sidePanelOpen ?? true;

  return (
    <div className="activity-bar">
      <div className="activity-bar__top">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`activity-bar__item ${sidePanelView === item.id && sidePanelOpen ? "activity-bar__item--active" : ""}`}
            onClick={() => setSidePanelView(item.id)}
            title={item.label}
          >
            <item.icon />
          </button>
        ))}
      </div>
    </div>
  );
}
