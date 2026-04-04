import { ChevronUp, ChevronDown, Check } from "lucide-react";
import type { ConflictRegion } from "./merge-conflicts";

interface Props {
  conflicts: ConflictRegion[];
  currentIndex: number;
  onAcceptOurs: (conflict: ConflictRegion) => void;
  onAcceptTheirs: (conflict: ConflictRegion) => void;
  onAcceptBoth: (conflict: ConflictRegion) => void;
  onNavigate: (index: number) => void;
}

export default function MergeConflictBar({
  conflicts,
  currentIndex,
  onAcceptOurs,
  onAcceptTheirs,
  onAcceptBoth,
  onNavigate,
}: Props) {
  if (conflicts.length === 0) return null;

  const conflict = conflicts[currentIndex] ?? conflicts[0];

  return (
    <div className="merge-conflict-bar">
      <span className="merge-conflict-bar__count">
        Conflict {currentIndex + 1} of {conflicts.length}
      </span>
      <div className="merge-conflict-bar__nav">
        <button
          type="button"
          className="merge-conflict-bar__btn"
          onClick={() => onNavigate(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          title="Previous conflict"
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          className="merge-conflict-bar__btn"
          onClick={() => onNavigate(Math.min(conflicts.length - 1, currentIndex + 1))}
          disabled={currentIndex === conflicts.length - 1}
          title="Next conflict"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      <div className="merge-conflict-bar__actions">
        <button
          type="button"
          className="merge-conflict-bar__action merge-conflict-bar__action--ours"
          onClick={() => onAcceptOurs(conflict)}
          title="Accept current (ours)"
        >
          Accept Ours
        </button>
        <button
          type="button"
          className="merge-conflict-bar__action merge-conflict-bar__action--theirs"
          onClick={() => onAcceptTheirs(conflict)}
          title="Accept incoming (theirs)"
        >
          Accept Theirs
        </button>
        <button
          type="button"
          className="merge-conflict-bar__action"
          onClick={() => onAcceptBoth(conflict)}
          title="Accept both"
        >
          <Check size={12} />
          Both
        </button>
      </div>
    </div>
  );
}
