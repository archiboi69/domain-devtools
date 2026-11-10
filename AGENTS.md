# Domain Devtools

Read README.md for setup, CLI usage, and supported source shapes. Use TypeScript and Effect. Vite+ owns installation, checks, tests, and builds.

Keep runtime contracts, source extraction, and execution evidence distinct. The generic diagrams show declarations, not inferred reachability. Unsupported source must fail explicitly. Preserve source text rather than paraphrasing business rules.

Keep tests application-independent. Changes to symbol resolution need cases for imports and override order. Changes to rendering need assertions for semantic labels as well as color. Do not include real application source, credentials, or generated application diagrams in commits.

Run `vp run check`, `vp test run`, and `vp run build` before completing a change. Use `vp run diagram src/diagram.fixture.ts Counter /tmp/counter.md` for a CLI smoke test. If tkmp is available, verify the output with `tkmp bench /tmp/counter.md`.
