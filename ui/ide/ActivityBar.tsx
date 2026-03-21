import { Files, MessageSquare, Search, GitBranch } from "lucide-react";
import { useAppStore, type SidePanelView } from "@/stores/app";

const ITEMS: { id: SidePanelView; icon: typeof Files; label: string }[] = [
  { id: "explorer", icon: Files, label: "Explorer" },
  { id: "chat", icon: MessageSquare, label: "Chat" },
  { id: "search", icon: Search, label: "Search" },
  { id: "git", icon: GitBranch, label: "Source Control" },
];

export default function ActivityBar() {
  const { sidePanelView, sidePanelOpen, setSidePanelView } = useAppStore();

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
