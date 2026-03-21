import { X } from "lucide-react";
import type { OpenFile } from "@/store";

interface Props {
  files: OpenFile[];
  activeIdx: number;
  onSelect: (idx: number) => void;
  onClose: (idx: number) => void;
}

export default function TabBar({ files, activeIdx, onSelect, onClose }: Props) {
  if (files.length === 0) return null;

  return (
    <div className="tab-bar">
      {files.map((file, i) => {
        const isActive = i === activeIdx;
        const cls = [
          "tab",
          isActive && "tab--active",
          file.modified && "tab--modified",
          file.preview && "tab--preview",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={file.path}
            className={cls}
            onClick={() => onSelect(i)}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(i);
            }}
          >
            <span
              className="tab__name"
              style={{
                ...(file.preview ? { fontStyle: "italic" } : {}),
                ...(file.deleted ? { textDecoration: "line-through", opacity: 0.5 } : {}),
              }}
            >
              {file.name}
            </span>
            {file.modified && <span className="tab__modified" />}
            <span
              className="tab__close"
              onClick={(e) => {
                e.stopPropagation();
                onClose(i);
              }}
              role="button"
              aria-label="Close tab"
            >
              <X size={12} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
