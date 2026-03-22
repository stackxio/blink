import { ChevronRight } from "lucide-react";

interface Props {
  filePath: string;
  workspacePath: string | null;
}

export default function Breadcrumbs({ filePath, workspacePath }: Props) {
  const relativePath =
    workspacePath && filePath.startsWith(workspacePath)
      ? filePath.slice(workspacePath.length).replace(/^\//, "")
      : filePath.split("/").slice(-3).join("/");

  const segments = relativePath.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <div className="breadcrumbs">
      {segments.map((segment, i) => (
        <span key={i} className="breadcrumbs__item">
          {i > 0 && <ChevronRight size={12} className="breadcrumbs__sep" />}
          <span className={i === segments.length - 1 ? "breadcrumbs__current" : "breadcrumbs__segment"}>
            {segment}
          </span>
        </span>
      ))}
    </div>
  );
}
