# Blink

AI-first code editor built on Tauri + Rust.

Blink is a lightweight, cross-platform IDE with AI deeply integrated into the editing experience.

## Features

- **Code editor** — CodeMirror 6 with syntax highlighting for 14+ languages
- **Multi-workspace** — switch between projects instantly, each with its own tabs, terminal, and state
- **Integrated terminal** — xterm.js + PTY, per-workspace terminal sessions
- **LSP support** — autocomplete, diagnostics, hover (TypeScript, Rust, Go, Python, and more)
- **File explorer** — lazy-loading tree with workspace navigation and file actions
- **Cmd+P** — fuzzy file search across workspace
- **AI providers** — bring your own: GPT/Codex, Claude, Ollama, or any OpenAI-compatible API
- **Themes** — dark/light mode with VS Code-compatible syntax highlighting
- **Auto-updater** — built-in update checking via Tauri
- **macOS native** — overlay titlebar, vibrancy, traffic light integration

## Tech Stack

| Layer           | Choice                            |
| --------------- | --------------------------------- |
| Desktop         | Tauri v2                          |
| Backend         | Rust                              |
| Frontend        | React + TypeScript + Vite         |
| Styling         | SCSS + CSS custom properties      |
| Editor          | CodeMirror 6                      |
| Terminal        | xterm.js + portable-pty           |
| LSP             | Rust broker (JSON-RPC over stdio) |
| State           | Zustand                           |
| Database        | SQLite (rusqlite)                 |
| Package manager | Bun                               |

## Project Structure

```
blink/
├── ui/                    # React frontend
│   ├── ide/               # IDE components (editor, file tree, terminal, tabs, etc.)
│   ├── components/        # Shared UI components
│   ├── features/          # Settings pages
│   ├── overlays/          # Settings and extension overlays
│   ├── styles/            # SCSS (variables, mixins, themes, components, IDE layout)
│   ├── store.ts           # Zustand app/workspace state
│   ├── App.tsx
│   └── main.tsx
├── core/                  # Rust/Tauri backend
│   ├── src/
│   │   ├── lsp/           # LSP broker (manager, transport, registry)
│   │   ├── commands/      # Tauri IPC (editor, terminal, lsp, workspaces, ai, etc.)
│   │   ├── providers/     # AI providers (OpenAI, Anthropic, Ollama, custom)
│   │   ├── services/      # Chat service, AI router
│   │   ├── db/            # SQLite schema, queries, models
│   │   ├── connectors/    # Filesystem, clipboard, browser
│   │   ├── settings/      # Config, prompts
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── ROADMAP.md
├── Makefile
├── package.json
└── vite.config.ts
```

## Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Bun](https://bun.sh/)

### Install & Run

```bash
bun install
bun run hooks:install
bun run app
```

### Build

```bash
bun run app:build
```

### Scripts

```bash
bun run app        # Dev mode (Vite + Tauri)
bun run app:build  # Production build
bun run dev        # Vite dev server only
bun run typecheck  # TypeScript check
bun run lint       # ESLint
bun run format     # Prettier + cargo fmt
bun run format:rust # cargo fmt for the Rust core
make check          # Format checks + typecheck + Rust check
bun run db:reset   # Reset local database
```

### Data

- **`~/.blink/`** — database, memory, prompts
- **`~/.blink/servers/`** — locally installed LSP servers

## AI Providers

| Provider   | Description                |
| ---------- | -------------------------- |
| **GPT**    | Codex / OpenAI models      |
| **Claude** | Anthropic Claude           |
| **Ollama** | Local models (Llama, etc.) |
| **Custom** | Any OpenAI-compatible API  |

## Windows Support

Windows support is planned for a future release. Blink currently targets macOS as the primary platform. Windows builds will include native window chrome, proper path handling, and platform-specific shell detection for the integrated terminal. Track progress in the [roadmap](ROADMAP.md).
