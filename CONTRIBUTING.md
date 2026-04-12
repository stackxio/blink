# Contributing to Codrift

Thanks for your interest in contributing. Here's everything you need to get started.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- [Rust](https://rustup.rs) (stable)
- macOS (the only supported build target right now)

## Setup

```bash
git clone https://github.com/stackxio/codrift
cd codrift
bun install
```

## Development

Start the app in dev mode:

```bash
bun run dev
```

This runs Vite (hot-reload UI) + the Tauri dev shell in one command.

## Project structure

```
core/          Rust/Tauri backend (window management, file I/O, IPC)
ui/            React/TypeScript frontend (editor, panels, overlays)
packages/
  blink-code/  AI chat bridge — Bun subprocess, runs tools, streams to UI
    ide-bridge.ts   Entry point, message loop
    tools/          One file per AI tool (read_file, git_commit, …)
    panel/          Engine, providers, memory, slash commands, compact
```

## Making changes

- **UI changes** — edit files in `ui/`. Hot reload picks them up instantly.
- **Rust changes** — edit files in `core/src/`. Tauri rebuilds automatically in dev mode.
- **AI tools** — add a new file in `packages/blink-code/tools/`, export `def` + a named function, then register it in `packages/blink-code/tools.ts`.

## Adding a new AI tool

1. Create `packages/blink-code/tools/<tool_name>.ts`:

```ts
export async function tool_name(input: Record<string, unknown>): Promise<string> {
  // implementation
}

export const def = {
  name: "tool_name",
  description: "What this tool does.",
  parameters: {
    type: "object",
    properties: {
      param: { type: "string", description: "..." },
    },
    required: ["param"],
  },
};
```

2. Import and register it in `packages/blink-code/tools.ts`.

## Typecheck

```bash
bun run typecheck
```

Must pass before opening a PR.

## Pull requests

- Keep PRs focused — one feature or fix per PR.
- Match the existing code style (no linter config, just follow what's there).
- Write a clear PR description explaining what changed and why.
- Typecheck must pass.

## Reporting issues

Open an issue on GitHub with as much context as possible — OS version, steps to reproduce, and any relevant logs from the Tauri dev console.
