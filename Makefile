SHELL := /bin/zsh

.PHONY: install dev build tauri app app-build lint typecheck rust-check check format format-check format-js format-js-check format-rust format-rust-check

install:
	bun install

dev:
	bun run dev

build:
	bun run build

tauri:
	bun run tauri

app:
	bun run app

app-build:
	bun run app:build

lint:
	bun run lint

typecheck:
	bun run typecheck

rust-check:
	cargo check --manifest-path core/Cargo.toml

check:
	bun run typecheck
	cargo check --manifest-path core/Cargo.toml

format-js:
	bun run format:js

format-js-check:
	bun run format:js:check

format-rust:
	bun run format:rust

format-rust-check:
	bun run format:rust:check

format:
	bun run format

format-check:
	bun run format:check
