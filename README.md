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
├── ui/                   # React frontend
│   ├── components/       # ChatArea, Sidebar, MessageBubble, etc.
│   ├── features/         # settings, automations
│   ├── layout/
│   ├── lib/
│   ├── App.tsx
│   └── main.tsx
├── core/                 # Rust/Tauri backend
│   ├── src/
│   │   ├── providers/    # openai (Codex), anthropic (Claude Code), ollama, caret, api (custom)
│   │   ├── services/     # chat (request build, router), router
│   │   ├── db/           # schema, queries, models (threads, messages, folders)
│   │   ├── commands/     # Tauri IPC (ai, threads, files, settings)
│   │   ├── connectors/   # filesystem, browser
│   │   ├── settings/     # config, store, prompts
│   │   ├── agent/
│   │   ├── tools/
│   │   ├── lib.rs
│   │   └── main.rs
│   ├── icons/            # App icon (PNGs, .icns, .ico, icon.iconset); see "App icon" below
│   ├── Cargo.toml
│   └── tauri.conf.json
├── assets/               # Source assets (e.g. app icon)
├── scripts/
│   └── start-dev-app.sh  # macOS: dev server + Caret.app with icon
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

- **macOS:** Starts the Vite dev server, builds the Rust app in dev mode, then launches **Caret.app** (with your app icon in the Dock). The dev .app is removed when you stop the script (Ctrl+C). Hot reload works.
- **Other platforms:** Runs `tauri dev` (Vite + Tauri window) as usual.

### Build

```bash
pnpm app:build
```

Produces a release build and bundle (e.g. `core/target/release/bundle/macos/Caret.app` and a DMG).

### App icon (macOS)

On macOS, the system does **not** apply rounded corners to app icons; the icon art must include the shape. If the Dock shows Caret as a sharp square instead of a rounded “squircle” like other apps:

**Quick fix:** From the repo root, run:

```bash
pnpm icon:fix
```

This applies a squircle mask (transparent corners) to the existing 1024×1024 icon, writes `core/app-icon.png`, and regenerates the full icon set (including `icon.icns`). Rebuild the app so the Dock picks up the new icon.

**Custom icon:** To use your own 1024×1024 source with transparent corners or a drawn squircle, create the PNG and run `pnpm icon path/to/your-icon.png`. You can use [Apple Design Resources](https://developer.apple.com/design/resources/) (macOS App Icon template).

### Other Scripts

```bash
pnpm dev          # Vite dev server only (no Tauri)
pnpm build        # Frontend build only
pnpm icon [file]  # Regenerate app icons from a 1024×1024 PNG (default: core/app-icon.png)
pnpm icon:fix     # Apply squircle mask to current icon so macOS Dock shows rounded corners
pnpm db:reset     # Remove ~/.caret/caret.db (recreated on next launch)
pnpm lint         # ESLint
pnpm format       # Prettier format
pnpm format:check # Prettier check
```

### Data & config

- **`~/.caret/`** — Created on first run. Contains `caret.db` (threads, messages, folders), `prompts/`, and `memory/`.
- **Config dir** — Settings (provider, model, etc.) live in the platform config directory (e.g. `~/Library/Application Support/caret` on macOS, `~/.config/caret` on Linux) and are created on first save.

## AI Providers

Caret is provider-agnostic. Choose your provider in the composer bar:

| Provider   | Description                    |
| ---------- | ------------------------------ |
| **GPT**    | Codex app-server (OpenAI)      |
| **Claude** | Claude Code CLI                |
| **Ollama** | Local models (e.g. Llama)      |
| **Custom** | Any OpenAI-compatible API      |

Model selectors in the composer let you pick the exact model per provider (e.g. GPT-5.4, Sonnet, Opus). Settings (provider and model) are persisted locally.

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
