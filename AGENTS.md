# Prototype Instructions

## Confirmed product direction

- Product: ACKS X Article Editor. User selected the paper-like three-column mock with both light and dark themes; reference PNGs live in docs/design/.
- Source Markdown is the editable truth; preview consumes converted blocks. Theme switching must not modify source text or exported image bytes.
- User explicitly requests a production-capable app, local persistence, real tests, private GitHub repository, and Docker deployment behind the existing ACKS server proxy at xeditor.acks.com.cn. Do not deploy to Sites for this task.
- Keep X account operations unavailable until the dedicated bridge and real account verification are complete. Do not pretend local structure validation means X acceptance.
- Never commit credentials or private document contents; keep the repository private until the user's full-readiness condition is met.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
