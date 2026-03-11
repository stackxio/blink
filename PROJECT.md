# Caret — Project Overview

> AI control layer for your computer, built by **Voxire**.

Caret is a native desktop app that acts as an AI operator for your machine — understanding files, organizing folders, renaming intelligently, and automating workflows through natural conversation. It runs entirely locally (no cloud dependency) and ships as a single binary via Tauri.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 |
| Backend | Rust |
| Frontend | React 19 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Icons | Lucide React |
| Database | SQLite (rusqlite, bundled) |
| Package manager | pnpm |
| Markdown | react-markdown + remark-gfm |

---

## Project Structure

```
caret/
├── core/                        # Rust backend (Tauri app)
│   ├── src/
│   │   ├── lib.rs               # Tauri setup, command registration, state init
│   │   ├── main.rs              # Executable wrapper
│   │   ├── ai/                  # AI provider architecture
│   │   │   ├── provider.rs      # AIProvider trait (chat + chat_stream)
│   │   │   ├── router.rs        # Routes requests to active provider
│   │   │   ├── types.rs         # ChatRequest, ChatResponse, AIError
│   │   │   ├── codex.rs         # Codex CLI provider (/opt/homebrew/bin/codex exec)
│   │   │   ├── codex_server.rs  # Codex app-server JSON-RPC (persistent sessions)
│   │   │   ├── ollama.rs        # Ollama HTTP provider (localhost:11434)
│   │   │   └── custom.rs        # OpenAI-compatible custom API
│   │   ├── commands/            # Tauri IPC commands
│   │   │   ├── ai.rs            # chat_stream, chat, cancel_stream
│   │   │   ├── settings.rs      # get_settings, save_settings
│   │   │   ├── threads.rs       # Thread/folder CRUD
│   │   │   ├── files.rs         # File operations (TODO)
│   │   │   ├── skills.rs        # Prompt file CRUD
│   │   │   └── memory.rs        # Daily memory file operations
│   │   ├── db/                  # SQLite database layer
│   │   │   ├── init.rs          # DB initialization & migrations
│   │   │   ├── schema.rs        # Table definitions (folders, threads, messages)
│   │   │   ├── models.rs        # DbFolder, DbThread, DbMessage
│   │   │   └── queries.rs       # All SQL queries
│   │   ├── settings/            # Configuration & prompt system
│   │   │   ├── config.rs        # CaretSettings struct
│   │   │   ├── store.rs         # JSON file persistence
│   │   │   └── prompts.rs       # Prompt loading, composition, memory system
│   │   ├── agent/               # Agent framework (mostly TODO)
│   │   │   ├── planner.rs       # Goal → step decomposition
│   │   │   ├── executor.rs      # Step execution
│   │   │   └── memory.rs        # In-memory entry storage
│   │   ├── connectors/          # System integrations (TODO)
│   │   │   ├── filesystem.rs    # File I/O
│   │   │   ├── clipboard.rs     # Clipboard read/write
│   │   │   └── browser.rs       # URL opening
│   │   └── tools/               # Tool system (skeleton)
│   │       ├── tool_registry.rs # Tool registration & lookup
│   │       └── tool_executor.rs # Tool execution wrapper
│   ├── defaults/
│   │   └── prompts/             # 6 default system prompt files
│   │       ├── identity.md
│   │       ├── soul.md
│   │       ├── user.md
│   │       ├── guidelines.md
│   │       ├── context.md
│   │       └── tools.md
│   ├── Cargo.toml
│   └── tauri.conf.json
├── ui/                          # React frontend
│   ├── main.tsx                 # React entry point
│   ├── App.tsx                  # Router setup
│   ├── index.css                # Tailwind config + custom styles
│   ├── components/
│   │   ├── ChatArea.tsx         # Chat interface (input, streaming, suggestions)
│   │   ├── Sidebar.tsx          # Thread/folder tree, drag-drop, context menus
│   │   ├── MessageBubble.tsx    # Message rendering + activity log
│   │   ├── StatusBar.tsx        # Loading/ready indicator
│   │   └── ui/                  # shadcn/ui primitives
│   ├── layout/
│   │   ├── ChatLayout.tsx       # Main layout (sidebar + chat + status bar)
│   │   └── SettingsLayout.tsx   # Settings layout (nav + content)
│   ├── features/
│   │   └── settings/
│   │       ├── General.tsx      # Prompt mode selector
│   │       ├── Providers.tsx    # AI provider display
│   │       ├── Skills.tsx       # Prompt file editor
│   │       ├── Memory.tsx       # Memory file viewer
│   │       └── Appearance.tsx   # Theme selector (light/dark/system)
│   └── lib/
│       ├── theme.ts             # Theme management (localStorage)
│       └── utils.ts             # Utilities
├── index.html                   # Vite entry HTML
├── vite.config.ts               # Vite config (@ alias, port 1420)
├── package.json                 # Scripts + dependencies
└── tsconfig.*.json              # TypeScript configs
```

### Key structural decisions

- **`core/` instead of `src-tauri/`** — cleaner naming, uses `TAURI_DIR=core` env var
- **`ui/` instead of `src/`** — frontend source separated from config, Vite points `index.html → /ui/main.tsx`
- **`@` path alias** maps to `./ui` for clean imports

---

## Commands

| Command | What it does |
|---------|-------------|
| `pnpm app` | Run dev mode (Vite + Tauri together) |
| `pnpm app:build` | Production build |
| `pnpm dev` | Vite dev server only (no Rust) |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |
| `pnpm db:reset` | Delete SQLite DB and start fresh |

---

## Architecture

### AI Provider System

Trait-based, pluggable provider architecture. Any provider implements `AIProvider` with `chat()` and `chat_stream()`. The router dispatches to whichever provider is active in settings.

```
AIProvider (trait)
├── Codex CLI        — runs /opt/homebrew/bin/codex exec (sync, one-shot)
├── Codex Server     — persistent JSON-RPC client with thread context
├── Ollama           — HTTP to localhost:11434
└── Custom API       — OpenAI-compatible endpoint (configurable)
```

**Streaming**: Each provider sends chunks through an `mpsc::Sender<String>`. The frontend listens via Tauri events (`chat:chunk`, `chat:done`, `chat:error`, `chat:activity`).

### Prompt System

6 modular prompt files loaded from `~/.caret/prompts/` (seeded from `core/defaults/prompts/` on first run). Composed into a system prompt based on the selected mode:

| Mode | What's included |
|------|----------------|
| `full` | All 6 prompts + today's memory, sorted by priority |
| `minimal` | identity.md + soul.md only |
| `none` | Single-line identity string |

**Priority order**: identity (0) → soul (1) → user (2) → guidelines (3) → context (4) → tools (5) → custom (10)

### Memory System

Daily memory files at `~/.caret/memory/YYYY-MM-DD.md`. Automatically injected into the system prompt in `full` mode. Can be viewed and cleared from Settings → Memory.

### Database

SQLite at `~/.caret/caret.db` with 3 tables:

- **folders** — id, name, position, created_at
- **threads** — id, folder_id (FK), title, codex_thread_id, created_at, updated_at
- **messages** — id, thread_id (FK), role (user/assistant), content, duration_ms, created_at

Migrations run on app startup via `db/schema.rs`.

### Activity Display

When using Codex, the app shows thinking activity (file reads, commands, searches, file changes) in collapsible logs above assistant messages. The codex_server parses `item/started` and `item/completed` JSON-RPC notifications and emits `chat:activity` events. Unknown/reasoning items are filtered out to avoid spam.

---

## Routes

```
/                       → ChatLayout → ChatArea (empty state)
/chat/:threadId         → ChatLayout → ChatArea (active thread)
/settings               → SettingsLayout → General
/settings/providers     → SettingsLayout → Providers
/settings/skills        → SettingsLayout → Skills
/settings/memory        → SettingsLayout → Memory
/settings/appearance    → SettingsLayout → Appearance
*                       → Redirect to /
```

---

## Tauri Commands (IPC API)

### Chat
- `chat_stream(input)` → emits `chat:chunk`, `chat:activity`, `chat:done`, `chat:error`
- `chat(input)` → returns full response
- `cancel_stream(session_id)` → cancels active stream

### Settings
- `get_settings()` → CaretSettings
- `save_settings(settings)` → persists to JSON

### Threads & Folders
- `create_thread`, `list_threads`, `delete_thread`, `update_thread_title`, `move_thread_to_folder`
- `create_folder`, `list_folders`, `delete_folder`, `rename_folder`
- `send_message`, `list_messages`

### Skills (Prompt Files)
- `list_skills`, `read_skill`, `save_skill`, `create_skill`, `delete_skill`, `reset_skills`

### Memory
- `list_memory_files`, `read_memory_file`, `append_memory`, `clear_today_memory`

### Files (TODO)
- `summarize_folder`, `organize_downloads`, `rename_file_with_ai`

---

## UI Features

- **Chat**: Streaming responses, markdown rendering, code blocks, suggestion chips for empty state
- **Sidebar**: Resizable, collapsible (Cmd+B), thread/folder tree, drag-and-drop threads between folders, right-click context menus, inline rename
- **Activity log**: Collapsible display of AI thinking steps (file reads, commands, searches)
- **Theme**: Light, dark, and system modes with CSS custom property overrides
- **Settings**: 5 pages — General, AI Providers, Skills, Memory, Appearance
- **Status bar**: Shows "Working..." during streaming, "Ready" when idle

---

## Data Locations

| What | Path |
|------|------|
| Database | `~/.caret/caret.db` |
| Settings | `~/.config/caret/settings.json` |
| Prompt files | `~/.caret/prompts/` |
| Memory files | `~/.caret/memory/` |

---

## TODO / Not Yet Implemented

- **Agent framework**: Planner and executor are stubbed — no multi-step autonomous task execution yet
- **Tool system**: Registry and executor exist but no tools are registered
- **Connectors**: Filesystem, clipboard, and browser connectors are all TODO
- **File commands**: `summarize_folder`, `organize_downloads`, `rename_file_with_ai` are stubs
- **Provider settings UI**: Provider config page is read-only display, no save logic

---

## Development Preferences & Coding Style

### What we like
- **Clean, well-structured code** — clear separation of concerns, no spaghetti
- **Dark theme UI** — dark-first design, light mode supported but dark is primary
- **Single command workflow** — `pnpm app` runs everything
- **Direct and concise** — no filler, no over-engineering
- **Optimistic UI** — update state immediately, fire async ops in background, catch silently
- **Trait-based abstractions** in Rust — pluggable providers, not hardcoded to one service

### Coding behavior
- **Edit existing files** over creating new ones whenever possible
- **Keep it simple** — three similar lines > premature abstraction
- **No unnecessary error handling** — trust internal code, only validate at boundaries
- **No docstring/comment spam** — only comment where logic isn't self-evident
- **Tailwind classes inline** — no CSS modules, no styled-components
- **shadcn/ui** for reusable primitives — don't reinvent buttons and inputs
- **Lucide** for icons — consistent, tree-shakeable
- **`invoke()`** for all Rust↔React communication via Tauri IPC
- **Tauri events** for streaming data (chunks, activities, completion signals)
- **SQLite** for persistence — no ORM, raw SQL in `queries.rs`
- **JSON files** for settings — simple, human-readable
- **File-based prompts** — modular, user-editable, not hardcoded strings
- **UUID primary keys** everywhere — `crypto.randomUUID()` in TS, uuid crate equivalent in Rust

### What we don't like
- Over-engineering for hypothetical futures
- Feature flags or backwards-compatibility shims
- Unnecessary abstractions for one-time operations
- CSS-in-JS or CSS modules (Tailwind only)
- Heavy frameworks when simple state management works
- Cloud dependencies when local-first is possible
