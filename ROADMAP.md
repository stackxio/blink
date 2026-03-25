# Caret IDE — Roadmap

**Vision:** AI-first IDE with multi-workspace support, built on Tauri + Rust.

**Status:** Phases 0-7 complete. Active development on v0.1.x polish + new features.

---

## v0.1.x — Active work queue

Work through these in order, one at a time.

### High priority
- [x] Settings refactor — split General.tsx, move editor prefs off localStorage, wire Providers forms to backend
- [x] Provider settings wiring — Ollama endpoint/model + Custom API endpoint/key/model save & load
- [x] Auto-updater flow — commands + UI wired; **needs signing keys**: run `pnpm tauri signer generate`, add private key to GitHub secret `TAURI_SIGNING_PRIVATE_KEY`, put pubkey in `core/tauri.conf.json`
- [x] LSP diagnostics — squiggles in editor + Problems panel in bottom bar + error/warning counts in status bar

### Medium priority
- [x] Batch find & replace across files
- [x] Git panel polish — push/pull buttons, create branch; merge conflict resolution deferred to future
- [ ] MCP server management — backend spawning/lifecycle, wire UI handlers
- [ ] AI tool calling framework — agent actions, tool registry

### Lower priority
- [ ] Code signing + notarization (Apple Developer account)
- [ ] Extensions/plugin system
- [ ] Debugger integration (DAP)
- [ ] Windows + Linux builds

---

## What carries over from v0

- [x] Tauri v2 + Rust backend (core foundation)
- [x] AI provider system (Codex, Ollama, Claude, Custom — trait-based)
- [x] Chat/thread system → becomes the AI panel
- [x] Settings system + persistence
- [x] Auto-updater (tauri-plugin-updater)
- [x] Release pipeline (GitHub Actions, macOS arm64 + x64)
- [x] Database layer (SQLite via rusqlite)
- [x] macOS overlay titlebar + vibrancy

---

## Phase 0 — Foundation migration

**Goal:** Rip out the chat-app shell, set up the IDE foundation.

### Styling migration
- [x] Install `sass`
- [x] Create SCSS structure (`ui/styles/` with variables, mixins, reset, typography, themes, components, ide)
- [x] Remove Tailwind (`@tailwindcss/vite`, `tailwindcss`, `tailwind-merge`, `clsx`, `class-variance-authority`)
- [x] Remove Radix dependencies (`radix-ui` metapackage, all `@radix-ui/*`)
- [x] Build custom primitives in SCSS:
  - [x] Button (variants: default, ghost, outline, danger, secondary, link + sizes)
  - [x] Input / Textarea
  - [x] Dialog / Modal (portal-based, native close on Escape)
  - [x] ContextMenu (right-click, portal-based)
  - [x] DropdownMenu (with sub-menus, radio items)
  - [x] Toggle / Switch
  - [ ] Scrollbar styling

### State management
- [x] Install Zustand
- [x] Create workspace store (`ui/stores/workspace.ts`)
  - Open files + active file, modified state, preview mode
  - Git branch, chat thread ID
  - Factory function for per-workspace instances
- [x] Create app store (`ui/stores/app.ts`)
  - Side panel open/collapsed + view (explorer/chat/search/git)
  - Bottom panel, AI panel, theme, active workspace
- [ ] Migrate remaining `useState` / `useOutletContext` to stores (in progress — ChatArea still uses context)

### Layout shell
- [x] New IDE layout component (`ui/ide/IdeLayout.tsx`):
  ```
  ┌──────────┬──────────────────────┬──────────┐
  │ Activity │  Editor area         │ AI Panel │
  │ Bar      │  (tabs + content)    │ (chat)   │
  │          ├──────────────────────┤          │
  │          │  Bottom panel        │          │
  │          │  (terminal/output)   │          │
  ├──────────┴──────────────────────┴──────────┤
  │ Status bar                                 │
  └────────────────────────────────────────────┘
  ```
- [x] Resizable split panes (custom `PanelResizer` component)
  - Horizontal: sidebar | editor | AI panel
  - Vertical: editor | bottom panel
  - Drag handle, double-click to collapse, min/max widths
- [x] Activity bar (`ui/ide/ActivityBar.tsx`)
  - Explorer, Chat, Search, Git icons (top)
  - Settings icon (bottom)
  - Active indicator bar
- [x] Tab bar (`ui/ide/TabBar.tsx`)
  - Tabs with close, modified indicator, preview mode
  - Middle-click to close
- [x] Status bar (`ui/ide/IdeStatusBar.tsx`)
  - Branch, language, line:col, workspace name

---

## Phase 1 — File tree + Editor

**Goal:** Open a folder, browse files, edit code.

### File tree
- [x] Rust: `read_dir` command (lazy — load children on expand, sorts dirs first)
- [x] Rust: `read_file_content`, `write_file_content` commands
- [x] Rust: `open_folder_dialog` command (native folder picker)
- [ ] Rust: file watcher (`notify` crate) → Tauri events on create/delete/rename/modify
- [x] Frontend: file tree component (`ui/ide/FileTree.tsx`)
  - Expand/collapse folders (lazy loading from Rust)
  - File/folder icons (Folder, FolderOpen, File)
  - Single-click to preview, double-click to open (pin tab)
  - Indentation by depth
- [ ] Right-click context menu (new file, new folder, rename, delete, copy path)
- [ ] Drag-drop to move files
- [ ] Filter/search
- [x] "Open Folder" button → native dialog → sets workspace root

### Editor (CodeMirror 6)
- [x] Installed all CodeMirror packages (14 packages: view, state, commands, language, autocomplete, lint, search, + 7 language packs)
- [x] Editor component (`ui/ide/Editor.tsx`)
  - Load file content from Rust backend
  - Save on Cmd+S → `write_file_content`
  - Modified indicator (dot on tab)
  - Line numbers, active line highlight
  - Bracket matching, auto-close
  - Syntax highlighting (JS/TS/Python/Rust/HTML/CSS/JSON/Markdown)
  - Search (Cmd+F) via @codemirror/search
  - History (undo/redo)
  - Theme integrated with CSS variables
- [x] Tab bar wired to open files store
  - Close, middle-click close, modified dot, preview mode (italic)
- [ ] Editor splits (split right / split down)
- [ ] Breadcrumbs bar

### Theming integration
- [ ] Create theme JSON schema
- [ ] Ship 2 built-in themes: Caret Dark, Caret Light
- [ ] Theme loader: reads JSON → sets CSS variables on `:root`
- [ ] CodeMirror theme that reads from CSS variables
- [ ] VS Code theme import adapter (map VS Code JSON → Caret JSON)
- [ ] Theme picker in settings (preview before applying)
- [ ] Persist selected theme in settings

---

## Phase 2 — Terminal

**Goal:** Embedded terminal with per-workspace sessions.

### Rust backend
- [ ] Add `portable-pty` to Cargo.toml
- [ ] Terminal manager (`core/src/terminal/`)
  - Spawn PTY with user's default shell
  - Read/write via Tauri events
  - Resize (SIGWINCH)
  - Multiple sessions per workspace
  - Kill on workspace close
- [ ] Tauri commands: `terminal_create`, `terminal_write`, `terminal_resize`, `terminal_close`

### Frontend
- [x] Installed xterm.js (`@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl`)
- [x] Terminal component (`ui/ide/TerminalPanel.tsx`)
  - xterm.js instance connected to Rust PTY via Tauri events
  - Auto-fit on resize via ResizeObserver + FitAddon
  - Multiple terminal tabs with create/close
  - Auto-creates first terminal on panel open
- [x] Terminal panel (bottom panel)
  - Tab bar for multiple terminals
  - New terminal (+) button
  - Kill terminal button
- [x] Keyboard shortcut: Ctrl+` to toggle terminal panel
- [x] Terminal toggle button in status bar
- [x] Terminal themed with dark color scheme
- [ ] Split terminal
- [ ] WebGL renderer (addon installed, not yet enabled)

---

## Phase 3 — Multi-workspace

**Goal:** Multiple workspaces open simultaneously, instant switching.

### Workspace management
- [ ] Workspace tabs bar (top of window, above everything)
  ```
  [ caret ]  [ thehub ]  [ grimoire ]  [+]
  ```
- [ ] Each workspace stores independently:
  - File tree state
  - Open editor tabs + active tab
  - Terminal sessions (stay alive in background)
  - AI chat thread
  - Git branch
  - Scroll positions
- [ ] Workspace switcher (Cmd+1/2/3 or dropdown)
- [ ] "Open Folder" adds a new workspace tab
- [ ] Close workspace tab (confirms if unsaved files)
- [ ] Persist open workspaces across app restarts
- [ ] Recent workspaces list (settings or welcome screen)

### State isolation
- [ ] Each workspace = separate Zustand store instance
- [ ] Switching workspace swaps the active store
- [ ] Background workspaces retain state in memory
- [ ] Terminal PTYs keep running when workspace is backgrounded

---

## Phase 4 — LSP integration

**Goal:** Autocomplete, diagnostics, hover, go-to-definition.

### Rust LSP broker
- [ ] LSP manager (`core/src/lsp/`)
  - `manager.rs` — spawn/track/restart LSP server processes
  - `transport.rs` — JSON-RPC message framing over stdio
  - `registry.rs` — language → server binary mapping
- [ ] Tauri commands:
  - `lsp_start` — start server for a language
  - `lsp_request` — send request, return response
  - `lsp_notify` — send notification (no response)
- [ ] Tauri events:
  - `lsp:diagnostics` — server push diagnostics
  - `lsp:log` — server log messages

### Server detection / download
- [ ] Auto-detect installed servers:
  - `typescript-language-server` (TS/JS)
  - `rust-analyzer` (Rust)
  - `pyright` / `pylsp` (Python)
  - `gopls` (Go)
  - `vscode-css-languageserver` (CSS)
  - `vscode-html-languageserver` (HTML)
- [ ] Auto-download missing servers to `~/.caret/servers/`
- [ ] Settings UI: manage installed language servers

### Frontend integration
- [ ] CodeMirror LSP client adapter (`ui/lib/lsp-client.ts`)
  - `textDocument/didOpen`, `didChange`, `didSave`, `didClose`
  - `textDocument/completion` → CodeMirror autocomplete
  - `textDocument/hover` → CodeMirror tooltip
  - `textDocument/definition` → navigate to file/line
  - `textDocument/references` → results panel
  - `textDocument/publishDiagnostics` → CodeMirror lint
  - `textDocument/formatting` → format document
  - `textDocument/signatureHelp` → parameter hints
- [ ] Problems panel (bottom panel tab)
  - List all diagnostics across open files
  - Click to navigate to error
  - Filter by severity (error, warning, info)

---

## Phase 5 — AI panel evolution

**Goal:** AI becomes workspace-aware, can propose edits as diffs.

### Context awareness
- [ ] AI knows which file is open and cursor position
- [ ] AI can read file contents from workspace
- [ ] AI can search across workspace files
- [ ] AI gets git diff as context

### Inline AI features
- [ ] Ghost text suggestions (AI autocomplete in editor)
  - CodeMirror decoration extension
  - Tab to accept, Escape to dismiss
- [ ] Cmd+K inline edit
  - Select code → Cmd+K → describe change → AI generates diff
  - Show diff inline, accept/reject

### Diff review
- [ ] AI-proposed changes shown as unified diff
  - Per-file accept/reject
  - Inline diff view in editor (green/red lines)
- [ ] AI can create/delete/rename files (with confirmation)

### Terminal integration
- [ ] AI can run commands in terminal
- [ ] AI can read terminal output
- [ ] AI suggests commands based on errors

---

## Phase 6 — Git integration

**Goal:** Built-in git UI.

- [ ] Rust: git operations via `git2` crate
  - Status, diff, stage, unstage, commit, push, pull, branch, log
- [ ] Source control panel (activity bar → sidebar)
  - Changed files list (staged / unstaged / untracked)
  - Click file → diff view
  - Stage/unstage buttons
  - Commit message input + commit button
  - Push/pull buttons
- [ ] Git gutter in editor (added/modified/deleted lines)
- [ ] Branch indicator in status bar (click to switch)
- [ ] Blame annotations (toggle)
- [ ] Git log viewer

---

## Phase 7 — Command palette + Search

**Goal:** Cmd+Shift+P for everything, Cmd+Shift+F for search.

### Command palette
- [ ] Cmd+Shift+P opens palette
- [ ] Fuzzy search across all commands
- [ ] Recent commands
- [ ] File search (Cmd+P) — fuzzy find by filename
- [ ] Symbol search (Cmd+Shift+O) — functions/classes in current file
- [ ] Workspace symbol search (Cmd+T) — all symbols via LSP

### Global search
- [ ] Cmd+Shift+F opens search panel
- [ ] Rust: fast file search via `ripgrep` or custom walker
- [ ] Search in files with regex support
- [ ] Replace in files
- [ ] Search results as clickable list
- [ ] File/folder exclusion patterns

---

## Future (post-launch)

- [ ] Extension system (WASM-based plugins)
- [ ] Tree-sitter for accurate syntax highlighting (replace Lezer)
- [ ] Collaborative editing
- [ ] Remote workspaces (SSH)
- [ ] Integrated debugger (DAP protocol)
- [ ] Snippet system
- [ ] Windows + Linux support
- [ ] Settings sync across devices
- [ ] Plugin marketplace

---

## Tech stack (final)

| Layer | Choice |
|---|---|
| Desktop | Tauri v2 |
| Backend | Rust |
| Frontend | React + TypeScript |
| Styling | SCSS + CSS custom properties |
| Components | Full custom (no shadcn/Radix) |
| State | Zustand (workspace-scoped stores) |
| Editor | CodeMirror 6 |
| Syntax | Lezer (built-in) → Tree-sitter (later) |
| Terminal | xterm.js + portable-pty |
| LSP | Rust broker → stdio → Tauri IPC |
| Git | git2 crate |
| Database | SQLite (rusqlite) |
| Build | Vite |
| Package manager | pnpm |
