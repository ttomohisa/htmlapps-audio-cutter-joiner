# LLM Workflow

1. Read `AGENTS.md`.
2. Read `APP_SPEC.md`.
3. Inspect the current `src/index.template.html` and build/check scripts before editing.
4. Modify source/config only; do not hand-edit generated `dist` files.
5. Preserve existing behavior unless the specification explicitly changes it.
6. Keep JA/EN, desktop/mobile, local-processing guarantees, and CSP in scope for every change.
7. Run `scripts/check-repository.ps1` on Windows before release.
