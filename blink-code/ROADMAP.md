# Blink Code Fork Roadmap

## Goal

Make the donor runtime Blink-owned and local-first.

That means:
- no required claude.ai / Anthropic web dependencies for normal operation
- local tools and local-compatible providers first
- remote/cloud-only features removed or isolated behind explicit Blink-owned adapters

## Phase 1: Local-Only Guardrails

- [x] Add a Blink-owned local-only gate (`BLINK_CODE_LOCAL_ONLY`)
- [x] Disable claude.ai MCP auto-fetch in local-only mode
- [x] Remove deprecated bridge entrypoints from Blink runtime
- [x] Disable Claude-in-Chrome startup paths in local-only mode
- [ ] Audit remaining web-connected startup code paths

## Phase 2: Provider Boundary

- [ ] Wrap Anthropic SDK usage behind Blink-owned provider interfaces
- [ ] Separate local-compatible providers from cloud-only providers
- [ ] Replace direct auth/env reads in app code with Blink-owned config access
- [ ] Identify which API/files/session flows can be removed entirely

## Phase 3: Feature Removal

- [ ] Remove remote-control / teleport / bridge product flows
- [ ] Remove claude.ai MCP connector flow
- [ ] Remove Chrome extension / native host browser automation flow
- [ ] Remove cloud subscription / billing / quota flows
- [ ] Remove cloud-managed settings sync paths

## Phase 4: Naming Cleanup

- [ ] Rename `CLAUDE_CODE_*` env vars to `BLINK_CODE_*`
- [ ] Remove user-facing Claude / claude.ai / Anthropic branding
- [ ] Rename internal Claude-specific helpers where Blink owns the contract
- [ ] Leave true upstream protocol identifiers isolated until replaced

## Notes

- This is a runtime fork, not a cosmetic rename.
- We should prefer safe isolation over giant search/replace churn.
