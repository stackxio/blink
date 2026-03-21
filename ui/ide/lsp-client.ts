/**
 * Frontend LSP client — bridges CodeMirror ↔ Tauri IPC ↔ LSP servers.
 *
 * Handles:
 * - textDocument/didOpen, didChange, didSave, didClose
 * - textDocument/completion → CodeMirror autocomplete
 * - textDocument/hover → CodeMirror tooltips
 * - textDocument/publishDiagnostics → CodeMirror lint
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type DiagnosticCallback = (uri: string, diagnostics: LspDiagnostic[]) => void;
type ResponseCallback = (result: unknown) => void;

export interface LspDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: number; // 1=error, 2=warning, 3=info, 4=hint
  message: string;
  source?: string;
}

interface PendingRequest {
  resolve: ResponseCallback;
  reject: (err: string) => void;
}

class LspClient {
  private langId: string | null = null;
  private initialized = false;
  private pendingRequests = new Map<number, PendingRequest>();
  private diagnosticListeners: DiagnosticCallback[] = [];
  private unlisten: (() => void) | null = null;
  private version = 0;

  async start(extension: string, workspaceRoot: string | null): Promise<string | null> {
    try {
      const langId = await invoke<string>("lsp_start", {
        extension,
        workspaceRoot,
      });
      this.langId = langId;

      // Listen for messages from this language server
      this.unlisten?.();
      this.unlisten = null;

      const fn = await listen<string>(`lsp:message:${langId}`, (event) => {
        this.handleMessage(event.payload);
      });
      this.unlisten = fn;

      // Send initialized notification after a brief delay for the server to process initialize
      setTimeout(() => {
        this.notify("initialized", {});
        this.initialized = true;
      }, 500);

      return langId;
    } catch {
      return null;
    }
  }

  stop() {
    if (this.langId) {
      invoke("lsp_stop", { langId: this.langId }).catch(() => {});
    }
    this.unlisten?.();
    this.unlisten = null;
    this.langId = null;
    this.initialized = false;
    this.pendingRequests.clear();
  }

  // ── Document lifecycle ──

  didOpen(uri: string, languageId: string, text: string) {
    if (!this.initialized) return;
    this.version = 1;
    this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version: this.version, text },
    });
  }

  didChange(uri: string, text: string) {
    if (!this.initialized) return;
    this.version++;
    this.notify("textDocument/didChange", {
      textDocument: { uri, version: this.version },
      contentChanges: [{ text }],
    });
  }

  didSave(uri: string, text: string) {
    if (!this.initialized) return;
    this.notify("textDocument/didSave", {
      textDocument: { uri },
      text,
    });
  }

  didClose(uri: string) {
    if (!this.initialized) return;
    this.notify("textDocument/didClose", {
      textDocument: { uri },
    });
  }

  // ── Requests ──

  async completion(uri: string, line: number, character: number): Promise<unknown> {
    return this.request("textDocument/completion", {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async hover(uri: string, line: number, character: number): Promise<unknown> {
    return this.request("textDocument/hover", {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async definition(uri: string, line: number, character: number): Promise<unknown> {
    return this.request("textDocument/definition", {
      textDocument: { uri },
      position: { line, character },
    });
  }

  // ── Diagnostics ──

  onDiagnostics(callback: DiagnosticCallback) {
    this.diagnosticListeners.push(callback);
    return () => {
      this.diagnosticListeners = this.diagnosticListeners.filter((cb) => cb !== callback);
    };
  }

  // ── Internal ──

  private async request(method: string, params: unknown): Promise<unknown> {
    if (!this.langId) throw new Error("LSP not started");
    const id = await invoke<number>("lsp_request", {
      langId: this.langId,
      method,
      params,
    });
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      // Timeout after 10s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject("LSP request timed out");
        }
      }, 10000);
    });
  }

  private notify(method: string, params: unknown) {
    if (!this.langId) return;
    invoke("lsp_notify", { langId: this.langId, method, params }).catch(() => {});
  }

  private handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw);

      // Response to a request
      if (msg.id != null && this.pendingRequests.has(msg.id)) {
        const pending = this.pendingRequests.get(msg.id)!;
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(msg.error.message || "LSP error");
        } else {
          pending.resolve(msg.result);
        }
        return;
      }

      // Server notification
      if (msg.method === "textDocument/publishDiagnostics") {
        const { uri, diagnostics } = msg.params;
        for (const cb of this.diagnosticListeners) {
          cb(uri, diagnostics);
        }
      }
    } catch {
      // Malformed message
    }
  }
}

// Singleton per language — reuse across files of the same language
const clients = new Map<string, LspClient>();

export function getLspClient(langId: string): LspClient {
  if (!clients.has(langId)) {
    clients.set(langId, new LspClient());
  }
  return clients.get(langId)!;
}

export function getOrStartLspClient(
  extension: string,
  workspaceRoot: string | null,
): { client: LspClient; startPromise: Promise<string | null> } {
  // Check if we already have a client for this extension's language
  const existing = Array.from(clients.entries()).find(([, c]) => c["langId"] && c["initialized"]);
  if (existing) {
    return { client: existing[1], startPromise: Promise.resolve(existing[0]) };
  }

  const client = new LspClient();
  const startPromise = client.start(extension, workspaceRoot).then((langId) => {
    if (langId) clients.set(langId, client);
    return langId;
  });

  return { client, startPromise };
}

export { LspClient };
