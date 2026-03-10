# Caret

AI control layer for your computer.

Caret is a desktop automation system that lets users interact with their computer using natural language. It acts as an operating layer — you bring your own AI provider, Caret handles the execution.

## Tech Stack

- **Desktop shell:** Tauri v2
- **Backend:** Rust
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Package manager:** pnpm

## Project Structure

```
caret/
├── ui/                   # React frontend source
│   ├── components/ui/    # shadcn components
│   ├── features/         # command, chat, activity, settings
│   ├── hooks/
│   ├── lib/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── core/                 # Rust/Tauri backend
│   ├── src/
│   │   ├── ai/           # provider trait, router, codex, ollama, custom
│   │   ├── agent/        # planner, executor, memory
│   │   ├── tools/        # tool registry and executor
│   │   ├── connectors/   # filesystem, clipboard, browser
│   │   ├── settings/     # config and persistence
│   │   ├── commands/     # Tauri IPC commands
│   │   ├── lib.rs
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)

### Install

```bash
pnpm install
```

### Run

```bash
pnpm app
```

This starts both the Vite dev server and the Tauri desktop window.

### Build

```bash
pnpm app:build
```

### Other Scripts

```bash
pnpm dev          # Vite dev server only (no Tauri)
pnpm build        # Frontend build only
pnpm lint         # ESLint
pnpm format       # Prettier format
pnpm format:check # Prettier check
```

## AI Provider Switcher

Caret is not locked to one AI. Users choose their provider:

| Provider    | Status      |
| ----------- | ----------- |
| Codex       | Default     |
| Ollama      | Supported   |
| Custom API  | Supported   |
| Claude Code | Coming soon |

Settings are persisted locally. Switch providers from the settings screen.

## Architecture

```
UI → AI Router → Selected Provider → LLM API
                                        ↓
                                   Agent Planner
                                        ↓
                                   Tool Registry
                                        ↓
                                   Connector Execution
                                        ↓
                                   Result → UI
```

## MVP Focus

1. File understanding
2. Folder summarization
3. Download organizer
4. AI file renaming

## License

Proprietary — Voxire
