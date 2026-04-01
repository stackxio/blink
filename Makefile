SHELL := /bin/zsh

.PHONY: install dev build tauri app app-build lint typecheck rust-check check format format-check format-js format-js-check format-rust format-rust-check

install:
	pnpm install

dev:
	pnpm dev

build:
	pnpm build

tauri:
	pnpm tauri

app:
	pnpm app

app-build:
	pnpm app:build

lint:
	pnpm lint

typecheck:
	pnpm typecheck

rust-check:
	pnpm check:rust

check:
	pnpm check

format-js:
	pnpm format:js

format-js-check:
	pnpm format:js:check

format-rust:
	pnpm format:rust

format-rust-check:
	pnpm format:rust:check

format:
	pnpm format

format-check:
	pnpm format:check
