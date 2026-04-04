# Blink IDE — Roadmap

**Vision:** AI-first IDE with multi-workspace support, built on Tauri + Rust.

**Focus:** Phase 5 blink-code — full AI engine replacement using `dummy/` as the donor codebase.

---

## v0.1.x

- [ ] Debugger integration (DAP)
- [ ] Windows + Linux builds

---

## Phase 1 — File tree + Editor (remaining)

### File tree

- [ ] Filter/search within the tree (sidebar search panel exists; in-tree filter still optional)

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
  listModels?(): Promise<string[]>; // Ollama needs this
}
```

### What is dropped from the current panel

| Current                                | Replaced by                                       |
| -------------------------------------- | ------------------------------------------------- |
| `AiPanel.tsx` (large monolith)         | `BlinkCodePanel.tsx` + `QueryEngine`              |
| Provider dropdown in chat              | `/model` slash command + settings                 |
| Local React state for threads/messages | `BlinkCodeState` store                            |
| Agentic loop only for Custom provider  | Full agentic loop for **all** providers           |
| No slash commands                      | `/clear`, `/memory`, `/mcp`, `/model`, `/context` |
| No project memory                      | `BLINK.md` auto-injected into every prompt        |
| No git/system context                  | Auto-prepended on every turn                      |

### What is NOT included

- Plugin system — removed entirely
- `bridge/` — Claude.ai remote session (Claude-specific)
- `remote/` — CCR / teleport (Claude-specific)
- `upstreamproxy/` — CCR MITM proxy (Claude-specific)
- `buddy/` — companion pet UI (cosmetic, excluded for now)
- `voice/` — voice mode (Claude OAuth-specific)

### Implementation phases

#### 5.1 — Engine + Providers ✅

- `blink-code/` directory + `providers/` (anthropic, openai-compat, factory)
- `BlinkEngine` agentic loop (stream → tool calls → loop)
- `BlinkCodePanel.tsx` replaces `AiPanel.tsx`

#### 5.2 — Tools ✅

- Full tool suite: `read_file`, `write_file`, `list_dir`, `search_files`, `run_command`, `git_status`, `git_diff`, `create_dir`, `delete_path`, `rename_path`
- Permission dialog for destructive tool calls

#### 5.3 — Memory + context ✅

- `BLINK.md` scanner — global (`~/.blink/`) + workspace
- `context.ts` — workspace path, branch, active file in every system prompt

#### 5.4 — Slash commands ✅

- `/clear`, `/model`, `/memory`, `/context`, `/compact`, `/help`

#### 5.5 — Coordinator mode _(multi-agent)_

- [ ] Orchestrator/worker sub-agent mode
- [ ] Worker agents with scoped tool allowlists
- [ ] UI toggle: "agent mode"

---

## Phase 6 — Git integration (remaining)

- [ ] (Optional) migrate to **`git2`** crate for in-process git — only if needed for performance

---

## Phase 7 — Command palette + Search (remaining)

- [ ] **Symbol** search: Cmd+Shift+O (current file), Cmd+T (workspace) — depends on Phase 4 LSP symbol requests
- [ ] Deeper integration (e.g. search exclude globs UI polish) as needed

---

## Monorepo restructure — `packages/`

**Goal:** Treat `blink-code` and any future shared modules as proper packages alongside `ui/` and `core/`.

### Target layout

```
blink/
├── core/          ← Rust/Tauri backend (unchanged)
├── ui/            ← React frontend (unchanged)
├── packages/
│   ├── blink-code/      ← moved from root blink-code/
│   │   ├── panel/           ← runtime: engine, providers, ide-bridge
│   │   └── ...              ← rest of forked CLI code (being cleaned)
│   └── contracts/       ← NEW: shared type contracts
│       ├── bridge-protocol.ts   ← all bridge in/out message types
│       ├── provider-config.ts   ← ProviderConfig union (openai-compat | claude-code | codex)
│       └── index.ts
├── package.json   ← workspace root (add packages/* to workspaces)
└── Cargo.toml
```

### Why

- `blink-code` is a proper package — it has its own entry point (`ide-bridge.ts`), its own dependencies, and is spawned as a subprocess. It belongs in `packages/`, not at root.
- `contracts/` gives us a single source of truth for types that cross process boundaries (UI ↔ bridge ↔ Rust). Currently `BridgeOutEvent` is duplicated between `ide-bridge.ts` and `BlinkCodePanel.tsx`. `ProviderConfig` is imported via a `@@` path alias hack.
- Any future package (e.g. a VSCode extension, a CLI wrapper, a test harness) can import from `@blink/contracts` cleanly.

### Migration steps

- [ ] Add `"workspaces": ["packages/*"]` to root `package.json`
- [ ] Move `blink-code/` → `packages/blink-code/`, add its own `package.json` with `"name": "@blink/engine"`
- [ ] Create `packages/contracts/` with `bridge-protocol.ts` and `provider-config.ts`
- [ ] Update `@@` path alias in `ui/` vite config to point at `packages/blink-code/`
- [ ] Update `blink_code_bridge.rs` spawn path to `packages/blink-code/ide-bridge.ts`
- [ ] Import `BridgeOutEvent` / `BridgeInMessage` from `@blink/contracts` in both `ide-bridge.ts` and `BlinkCodePanel.tsx`

---

## Future (post-launch)

- [ ] Tree-sitter for accurate syntax highlighting (replace Lezer)
- [ ] Collaborative editing
- [ ] Remote workspaces (SSH)
- [ ] Snippet system
- [ ] Settings sync across devices

---

## Tech stack

| Layer           | Choice                                                            |
| --------------- | ----------------------------------------------------------------- |
| Desktop         | Tauri v2                                                          |
| Backend         | Rust                                                              |
| Frontend        | React + TypeScript                                                |
| Styling         | SCSS + CSS custom properties                                      |
| Components      | Full custom (no shadcn/Radix)                                     |
| State           | Zustand — multi-workspace as `workspaces[]` + `activeWorkspaceId` |
| Editor          | CodeMirror 6                                                      |
| Syntax          | Lezer (built-in) → Tree-sitter (later)                            |
| Terminal        | xterm.js + portable-pty (Tauri commands)                          |
| LSP             | Rust broker → stdio → Tauri IPC (`lsp-client.ts`)                 |
| Git             | `git` CLI from Rust (optional `git2` later)                       |
| Database        | SQLite (rusqlite)                                                 |
| AI engine       | blink-code (CLI/agent tree + `panel/` IDE adapter)                |
| AI providers    | Ollama, OpenAI-compatible, Anthropic, Codex paths (existing)      |
| Build           | Vite                                                              |
| Package manager | Bun                                                               |
