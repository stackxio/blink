import { ChevronRight } from "lucide-react";

interface Props {
  filePath: string;
  workspacePath: string | null;
  onFolderClick?: (path: string) => void;
}

export default function Breadcrumbs({ filePath, workspacePath, onFolderClick }: Props) {
  const relativePath =
    workspacePath && filePath.startsWith(workspacePath)
      ? filePath.slice(workspacePath.length).replace(/^\//, "")
      : filePath.split("/").slice(-3).join("/");

  const segments = relativePath.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const basePath = workspacePath ?? filePath.split("/").slice(0, -segments.length).join("/");

  return (
    <div className="breadcrumbs">
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;
        const absolutePath = basePath + "/" + segments.slice(0, i + 1).join("/");
        return (
          <span key={i} className="breadcrumbs__item">
            {i > 0 && <ChevronRight size={12} className="breadcrumbs__sep" />}
            {isLast ? (
              <span className="breadcrumbs__current">{segment}</span>
            ) : (
              <span
                className="breadcrumbs__segment breadcrumbs__segment--clickable"
                onClick={() => onFolderClick?.(absolutePath)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onFolderClick?.(absolutePath);
                }}
              >
                {segment}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
