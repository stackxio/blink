import { Sparkles } from "lucide-react";

export default function Welcome() {
  return (
    <div className="empty-state">
      <Sparkles size={48} className="empty-state__icon" />
      <h1 className="empty-state__title">Caret</h1>
      <p className="empty-state__text">
        Open a folder to start editing, or use the activity bar to navigate.
      </p>
    </div>
  );
}
