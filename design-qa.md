# Design QA

## Scoped 0.1.1 copy workflow review

The user supplied current preview and X paste screenshots. They show transferred text/list formatting, an empty X title field, and a missing table image. The new controls intentionally add title/body copy and per-image PNG actions without changing the selected editor layout.

Observed HTTP viewport: 680 × 815 CSS pixels. Local screenshots: `.local/clipboard-qa/preview-compact.png`, `.local/clipboard-qa/preview-compact-dark.png`, `.local/clipboard-qa/paste-png.png`. These artifacts are local-only; user account screenshots are not committed.

The copy controls are visible without overlap in the inspected compact light/dark states. Font families, semantic colors, image pixels and source content are retained; the added action/guidance rows are intentional scope changes. Clipboard MIME and decoded PNG were verified by actual local paste. X acceptance itself remains unverified. This scoped review does not clear the original full-editor baseline gate below.

source visual truth path: docs/design/reference-light.png and docs/design/reference-dark.png

Viewport target: 1487 × 1058 CSS pixels, matching the selected conceptual layout. First in-app browser screenshot was reviewed in the task, but no final screenshot artifact is available.

## Findings

- [P0] First captured preview was empty while Markdown source was present. The Markdown worker dependency resolved to a DOM-only entry. A targeted package alias and a production Worker regression test were added; browser re-verification is still required.
- [P2] Initial document ordering and real revision/time display differ from mock data. Real state is intentionally preserved; final density and alignment review is pending.
- Browser access was subsequently rejected by the browser security policy. No alternate browser, proxy or address was used to bypass the restriction.

## Required surfaces

Fonts/typography, spacing/layout rhythm, colors/tokens, image quality, and copy/content: preliminary first-screen inspection only. Full light/dark comparison at matching state and focused-region evidence are incomplete.

## Implementation checklist

Reopen via the supported HTTP application entry after access is available; verify conversion; capture both themes and responsive states; compare to the approved images in a combined comparison; complete all P0/P1/P2 fixes and real workflow checks.

final result: blocked
