import { useEffect, useState, memo } from "react";
import { invoke } from "@tauri-apps/api/core";

// ── Extension sets ────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tiff", "tif"]);
const SVG_EXTS = new Set(["svg"]);
const PDF_EXTS = new Set(["pdf"]);
const CSV_EXTS = new Set(["csv", "tsv"]);

export function isViewableFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext) || SVG_EXTS.has(ext) || PDF_EXTS.has(ext) || CSV_EXTS.has(ext);
}

function getMimeType(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "bmp") return "image/bmp";
  if (ext === "ico") return "image/x-icon";
  if (ext === "tiff" || ext === "tif") return "image/tiff";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCsv(text: string, delimiter = ","): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === delimiter && !inQuote) {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  });
}

// ── Sub-viewers ───────────────────────────────────────────────────────────────

function ImageViewer({ filePath, ext }: { filePath: string; ext: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSrc(null);
    setError(null);
    invoke<string>("read_file_base64", { path: filePath })
      .then((b64) => setSrc(`data:${getMimeType(ext)};base64,${b64}`))
      .catch((e) => setError(String(e)));
  }, [filePath, ext]);

  if (error) return <div className="file-viewer__error">{error}</div>;
  if (!src) return <div className="file-viewer__loading">Loading…</div>;
  return (
    <div className="file-viewer__image-wrap">
      <img src={src} alt={filePath.split("/").pop()} className="file-viewer__image" />
    </div>
  );
}

function PdfViewer({ filePath }: { filePath: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSrc(null);
    setError(null);
    invoke<string>("read_file_base64", { path: filePath })
      .then((b64) => setSrc(`data:application/pdf;base64,${b64}`))
      .catch((e) => setError(String(e)));
  }, [filePath]);

  if (error) return <div className="file-viewer__error">{error}</div>;
  if (!src) return <div className="file-viewer__loading">Loading…</div>;
  return <iframe src={src} className="file-viewer__pdf" title="PDF Viewer" />;
}

function CsvViewer({ content, filename }: { content: string; filename: string }) {
  const delimiter = filename.endsWith(".tsv") ? "\t" : ",";
  const rows = parseCsv(content, delimiter);
  if (rows.length === 0) return <div className="file-viewer__empty">Empty file</div>;

  const [header, ...body] = rows;
  const MAX_ROWS = 2000;
  const truncated = body.length > MAX_ROWS;

  return (
    <div className="file-viewer__csv-wrap">
      <table className="file-viewer__csv">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.slice(0, MAX_ROWS).map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <div className="file-viewer__truncated">
          Showing first {MAX_ROWS} of {body.length} rows
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  filePath: string;
  filename: string;
  content: string;
}

export const FileViewer = memo(function FileViewer({ filePath, filename, content }: Props) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  return (
    <div className="file-viewer">
      {(IMAGE_EXTS.has(ext) || SVG_EXTS.has(ext)) && <ImageViewer filePath={filePath} ext={ext} />}
      {PDF_EXTS.has(ext) && <PdfViewer filePath={filePath} />}
      {CSV_EXTS.has(ext) && <CsvViewer content={content} filename={filename} />}
    </div>
  );
});
