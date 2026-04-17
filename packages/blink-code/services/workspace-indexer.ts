import { exec } from "node:child_process";
import * as path from "node:path";

interface FileEntry {
  absolutePath: string;
  relativePath: string;
  name: string;
}

type IndexerListener = (status: "indexing" | "ready", fileCount?: number) => void;

class WorkspaceIndexer {
  private files: FileEntry[] = [];
  private ready = false;
  private root = "";
  private listeners: IndexerListener[] = [];

  onStatus(fn: IndexerListener): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  private emit(status: "indexing" | "ready", fileCount?: number) {
    for (const fn of this.listeners) fn(status, fileCount);
  }

  async index(workspacePath: string): Promise<void> {
    this.root = workspacePath;
    this.ready = false;
    this.files = [];
    this.emit("indexing");

    const entries = await this.scanFiles(workspacePath);
    this.files = entries;
    this.ready = true;
    this.emit("ready", entries.length);
  }

  private scanFiles(workspacePath: string): Promise<FileEntry[]> {
    return new Promise((resolve) => {
      // Try git ls-files first — respects .gitignore natively
      exec(
        `git ls-files`,
        { cwd: workspacePath, maxBuffer: 50 * 1024 * 1024 },
        (err, stdout) => {
          if (!err && stdout.trim()) {
            const entries = stdout
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((rel) => ({
                absolutePath: path.join(workspacePath, rel),
                relativePath: rel,
                name: path.basename(rel),
              }));
            resolve(entries);
            return;
          }

          // Fall back to find, excluding common large/generated directories
          const excludes = [
            "node_modules",
            ".git",
            "dist",
            "target",
            ".next",
            "build",
            "out",
          ]
            .map((d) => `-not -path '*/${d}/*'`)
            .join(" ");

          exec(
            `find . -type f ${excludes}`,
            { cwd: workspacePath, maxBuffer: 50 * 1024 * 1024 },
            (_err2, stdout2) => {
              const entries = stdout2
                .trim()
                .split("\n")
                .filter(Boolean)
                .map((rel) => {
                  // strip leading ./
                  const normalized = rel.startsWith("./") ? rel.slice(2) : rel;
                  return {
                    absolutePath: path.join(workspacePath, normalized),
                    relativePath: normalized,
                    name: path.basename(normalized),
                  };
                });
              resolve(entries);
            },
          );
        },
      );
    });
  }

  search(query: string, limit = 50): string[] {
    const q = query.toLowerCase();
    const results: string[] = [];
    for (const entry of this.files) {
      if (
        entry.relativePath.toLowerCase().includes(q) ||
        entry.name.toLowerCase().includes(q)
      ) {
        results.push(entry.absolutePath);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  isReady(): boolean {
    return this.ready;
  }

  getRoot(): string {
    return this.root;
  }
}

export const indexer = new WorkspaceIndexer();
