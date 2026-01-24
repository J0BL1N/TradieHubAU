# ARCHITECTURE.md — TradieHubAU (Current Intended Pattern)

## Layers (Vanilla)
1) Storage Layer: safe localStorage access (get/set/update + validation)
2) State Layer: canonical shapes and key map
3) Actions Layer: state mutations (post job, apply, send message)
4) Render Layer: pure UI rendering (templates)
5) Wiring Layer: event delegation + page init

## Principle
- Keep data mutation separate from rendering.
- Keep page init small and explicit.
- Prefer incremental refactors over rewrites.
