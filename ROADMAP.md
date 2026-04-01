# Blink IDE — Roadmap

**Vision:** AI-first IDE with multi-workspace support, built on Tauri + Rust.

**Focus:** Phase 5 blink-code — full AI engine replacement using `dummy/` as the donor codebase.

---

## v0.1.x

- [ ] Code signing + notarization (Apple Developer account)
- [ ] Auto-updater: TAURI signing keys in CI (`TAURI_SIGNING_PRIVATE_KEY` / pubkey in `tauri.conf.json`) if not already configured
- [ ] Debugger integration (DAP)
- [ ] Windows + Linux builds

---

## Phase 0 — Foundation

- [ ] Scrollbar styling (SCSS)
- [ ] Migrate remaining `useState` / `useOutletContext` to stores (e.g. ChatArea still uses context)

---

## Phase 1 — File tree + Editor (remaining)


### File tree
- [ ] Drag-drop to move files in the tree
- [ ] Filter/search within the tree (sidebar search panel exists; in-tree filter still optional)

### Editor
- [ ] Editor splits (split right / split down)
- [ ] Breadcrumbs bar

### Theming
- [ ] CodeMirror theme reads from CSS variables
- [ ] Theme JSON schema
- [ ] VS Code theme import adapter

---

## Phase 2 — Terminal (remaining)

- [ ] Split terminal UI
- [ ] WebGL renderer for xterm (addon present, not enabled)

---

## Phase 3 — Multi-workspace (remaining)

- [ ] Keyboard shortcuts to switch workspace by index (e.g. ⌘1–⌘9) — palette/quick-open exists; numeric workspace switching does not
- [ ] Confirm before **closing a workspace tab** if any open editor tabs in that workspace are **modified** (closing a *file* tab already prompts; workspace close does not)
- [ ] (Optional) multiple Zustand store *instances* vs one store + `workspaces[]` — current design is fine; only revisit if isolation/testing needs it

---

## Phase 4 — LSP integration (remaining)

### Still open
- [ ] **Wire LSP into the editor UX** beyond diagnostics: completion (today `Editor.tsx` uses CodeMirror’s built-in `autocompletion()`, not `textDocument/completion`), **hover** tooltips, **go-to-definition** (and keybinding), **references**, **formatting**, **signature help**
- [ ] **Workspace / document symbol** search (Cmd+Shift+O / Cmd+T) once definition + symbol requests are wired

---

## Phase 5 — blink-code (AI engine replacement)

**Goal:** Drop the current AI side panel entirely. Replace it with a full agentic coding engine (`blink-code`) powered by any model — Ollama, OpenAI-compatible endpoints, Anthropic, or any URL-based API. Adapted from the Claude Code source (in `dummy/`) with the **plugins system removed** and **skills retained**.

### Architecture

Two clean layers:

```
blink-code/   ← TypeScript — the "brain" (orchestration, tools, context, memory)
core/         ← Rust/Tauri  — the "muscles" (HTTP, file I/O, terminal, DB, MCP)
```

Data flow:

```
User input → CommandInput (parse /commands + @-mentions)
           → blink-code QueryEngine
           → context.ts (BLINK.md memory + git + system)
           → Provider (Ollama / OpenAI-compat / Anthropic)
           → Tool calls → Tauri invoke() → Rust executes
           → Streaming events → React UI
           → Persist → SQLite (Rust)
```

### Directory layout

```
blink-code/
├── engine/
│   ├── QueryEngine.ts        ← multi-turn conversation engine (adapted from dummy/)
│   ├── query.ts              ← turn loop: build → stream → tools → repeat
│   ├── Tool.ts               ← tool plugin interface (Zod schemas, permissions)
│   ├── Task.ts               ← background task types
│   ├── context.ts            ← prompt augmentation (git, system info, BLINK.md)
│   └── query/                ← QueryConfig, injectable deps, stop hooks
│
├── providers/
│   ├── types.ts              ← BlinkProvider interface + Message/StreamChunk types
│   ├── ollama.ts             ← Ollama REST (/api/chat, streaming NDJSON)
│   ├── openai-compat.ts      ← any OpenAI-compatible endpoint
│   ├── anthropic.ts          ← direct Anthropic SDK
│   └── index.ts              ← registry: reads settings, returns active provider
│
├── tools/
│   ├── index.ts              ← tool registry (no plugins — static list)
│   ├── BashTool/             ← bridges to Tauri run_command
│   ├── ReadTool/             ← bridges to Tauri read_file
│   ├── WriteTool/            ← bridges to Tauri write_file
│   ├── SearchTool/           ← bridges to Tauri search_files / ripgrep
│   ├── GlobTool/             ← bridges to Tauri list_dir
│   ├── GrepTool/             ← bridges to Tauri grep (new Rust command)
│   ├── GitTool/              ← bridges to Tauri git commands
│   ├── AgentTool/            ← sub-agent spawning
│   └── McpTool/              ← MCP client wrapper
│
├── commands/
│   ├── index.ts              ← static command registry (no plugin loading)
│   ├── clear/                ← /clear
│   ├── memory/               ← /memory (view/edit BLINK.md)
│   ├── mcp/                  ← /mcp
│   ├── model/                ← /model (switch provider inline)
│   └── context/              ← /context (show active context tokens)
│
├── memory/
│   ├── scanner.ts            ← finds BLINK.md in project root + ~/.blink/
│   ├── loader.ts             ← loads and injects into every prompt
│   └── index.ts
│
├── skills/                   ← bundled skills (from dummy/skills/)
│
├── state/
│   ├── store.ts              ← lightweight pub/sub
│   └── BlinkCodeState.ts     ← session state shape
│
├── schemas/                  ← shared Zod schemas (from dummy/schemas/)
│
└── utils/
    ├── messages.ts           ← message normalization
    ├── permissions.ts        ← tool permission helpers
    ├── tokenEstimator.ts     ← rough token counting
    └── git.ts                ← git helpers for context.ts

ui/ai/
├── BlinkCodePanel.tsx        ← new shell (replaces AiPanel.tsx entirely)
└── components/
    ├── MessageList.tsx       ← message rendering + thinking block parsing
    ├── MessageBubble.tsx     ← markdown, tool cards, activities
    ├── CommandInput.tsx      ← prompt bar with / and @ support
    ├── ContextChips.tsx      ← @-mentioned files/folders
    ├── ModelPicker.tsx       ← provider + model selector
    └── MemoryBadge.tsx       ← shows active BLINK.md context
```

### Provider interface

Every model just implements:

```typescript
interface BlinkProvider {
  name: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
  chatStream(req: ChatRequest, onChunk: (delta: string) => void): Promise<void>;
  listModels?(): Promise<string[]>;   // Ollama needs this
}
```

### What is dropped from the current panel

| Current | Replaced by |
|---|---|
| `AiPanel.tsx` (large monolith) | `BlinkCodePanel.tsx` + `QueryEngine` |
| Provider dropdown in chat | `/model` slash command + settings |
| Local React state for threads/messages | `BlinkCodeState` store |
| Agentic loop only for Custom provider | Full agentic loop for **all** providers |
| No slash commands | `/clear`, `/memory`, `/mcp`, `/model`, `/context` |
| No project memory | `BLINK.md` auto-injected into every prompt |
| No git/system context | Auto-prepended on every turn |

### What is NOT included

- Plugin system — removed entirely
- `bridge/` — Claude.ai remote session (Claude-specific)
- `remote/` — CCR / teleport (Claude-specific)
- `upstreamproxy/` — CCR MITM proxy (Claude-specific)
- `buddy/` — companion pet UI (cosmetic, excluded for now)
- `voice/` — voice mode (Claude OAuth-specific)

### Implementation phases

#### 5.1 — Engine + Providers *(highest value)*
- [ ] Create `blink-code/` directory structure
- [ ] Adapt `QueryEngine.ts` + `query.ts` with provider interface (remove Anthropic hard-coding)
- [ ] Implement `providers/ollama.ts`, `providers/openai-compat.ts`, `providers/anthropic.ts`
- [ ] New `BlinkCodePanel.tsx` wired to the engine
- [ ] Drop `AiPanel.tsx`

#### 5.2 — Full tool suite
- [ ] Port all tools from `dummy/tools/` bridged to Tauri commands
- [ ] Full agentic loop active for all providers (not just Custom)
- [ ] Add `grep` Tauri command (Rust + ripgrep)
- [ ] Tool permission callbacks wired to UI (approve/deny dialog)

#### 5.3 — Memory + context
- [ ] Port `memdir/` → `BLINK.md` project memory scanner + loader
- [ ] Port `context.ts` → git diff + system info auto-injected into prompts
- [ ] `MemoryBadge` in UI showing active context size

#### 5.4 — Slash commands
- [ ] Port slash command system from `dummy/commands/`
- [ ] `/memory` — view/edit `BLINK.md`
- [ ] `/mcp` — manage MCP servers inline
- [ ] `/model` — switch provider without leaving chat
- [ ] `/clear` — reset conversation
- [ ] `/context` — show current context token budget

#### 5.5 — Coordinator mode *(multi-agent)*
- [ ] Port `coordinator/` — orchestrator/worker mode
- [ ] Orchestrator sends sub-tasks to worker agents with scoped tool allowlists
- [ ] Exposed in UI as a toggle: "agent mode"

---

## Phase 6 — Git integration (remaining)

**Shipped:** Git **via `git` subprocess** (not `git2`): status, diff, stage, unstage, commit, push, pull, branches, log, blame; **Git panel** with file lists, diff view, commit, push/pull, collapsible **recent commits** (`git_log`).

### Still open
- [ ] Richer **log / history** UI (e.g. dedicated log viewer, graph), if desired beyond the panel’s commit list
- [ ] **Merge conflict** resolution UX (still deferred from earlier planning)
- [ ] (Optional) migrate to **`git2`** crate for in-process git — only if we need it for performance or embedding

---

## Phase 7 — Command palette + Search (remaining)

**Shipped:** **⌘⇧P** command palette (fixed command list + filter), **⌘P** quick file open, **⌘⇧F** sidebar **Search** (`search_in_files` + replace), batch replace backend exists.

### Still open
- [ ] Command palette: **recent commands**, **fuzzy** scoring, dynamic registration as commands grow
- [ ] **Symbol** search: Cmd+Shift+O (current file), Cmd+T (workspace) — depends on Phase 4 LSP symbol requests
- [ ] Deeper integration (e.g. search exclude globs UI polish) as needed

---

## Future (post-launch)

- [ ] Tree-sitter for accurate syntax highlighting (replace Lezer)
- [ ] Collaborative editing
- [ ] Remote workspaces (SSH)
- [ ] Snippet system
- [ ] Settings sync across devices
---

## Tech stack

| Layer | Choice |
|---|---|
| Desktop | Tauri v2 |
| Backend | Rust |
| Frontend | React + TypeScript |
| Styling | SCSS + CSS custom properties |
| Components | Full custom (no shadcn/Radix) |
| State | Zustand — multi-workspace as `workspaces[]` + `activeWorkspaceId` |
| Editor | CodeMirror 6 |
| Syntax | Lezer (built-in) → Tree-sitter (later) |
| Terminal | xterm.js + portable-pty (Tauri commands) |
| LSP | Rust broker → stdio → Tauri IPC (`lsp-client.ts`) |
| Git | `git` CLI from Rust (optional `git2` later) |
| Database | SQLite (rusqlite) |
| AI engine | blink-code (planned; `dummy/` donor) |
| AI providers | Ollama, OpenAI-compatible, Anthropic, Codex paths (existing) |
| Build | Vite |
| Package manager | pnpm |

