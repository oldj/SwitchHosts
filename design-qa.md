# Managed hosts boundary styling

final result: passed

## Visual references and evidence

- Source visual truth: `/Users/wu/.codex/generated_images/01a109cc-0b3d-7ec1-9ae3-632452b68392/exec-18cece01-e164-405c-a7e7-da55b154169d.png` (second displayed design).
- Implementation: `http://127.0.0.1:8220/tmp/marker-preview/index.html`, real application renderer with a copy of the existing Tauri test mock; no system file writes.
- Full view: `tmp/marker-preview/light.jpg`; dark mode: `tmp/marker-preview/dark.jpg`.
- Focused comparison: `tmp/marker-preview/detail.jpg`, editor rows 10–24, captured at x=320, y=225, width=835, height=290.
- Narrow view: `tmp/marker-preview/narrow.jpg`.
- Source pixels: 1536 × 1056, including decorative outer canvas and native chrome. Implementation CSS viewport and screenshot: 1400 × 900; focused screenshot: 835 × 290. Narrow CSS viewport: 1000 × 780. Screenshot output is 1 image pixel per CSS pixel.
- Compared full source and implementation images in one review input, then source and focused implementation in one input. This is a scoped component implementation: retain the existing app's 14px editor font, line height, panels and window chrome rather than adopting raster mockup sizing. Source mock has larger type, different sidebar fixture names and native window chrome; those are intentional existing-product differences, not changes requested here.
- State: Chinese, system hosts read-only viewer, start at line 11, end at line 23, both side panels open. Source and preview retain equivalent 25-line hosts content; whitespace is preserved from the preview fixture.

## Findings and comparison history

1. Initial browser inspection found a stale English label after asynchronous initial document load, and badge height extending about 1.4px below its line. Fixed the language lookup to use current locale at document creation and reduced badge line height / adjusted vertical offset. Post-fix focused image shows Chinese labels completely within their rows; DOM measurement confirms 15.68px badges inside 19.59px rows.
2. Full-view and focused post-fix comparison: no remaining actionable P0/P1/P2 differences within scope. Both marker strings remain complete, muted mauve, with thin full-width rules and compact right-aligned rose labels. Ordinary comments/IPs keep original highlighting.

## Required fidelity surfaces

- Typography: existing code font and size retained; labels use the app UI font at 0.8em. Full marker strings remain selectable and untruncated in document layout.
- Spacing/layout: no extra document lines or changed row height; compact labels fit between rules. At narrow widths the existing editor horizontal scroll exposes overflowing content, including badges; labels do not overlap marker text.
- Colors/tokens: light marker text #875766 and rule #dfb7c1; dark text #e0b5c0 and rule #785461; badges reuse theme accent tokens.
- Image quality/assets: this change contains no raster assets or new icons. UI is rendered by the actual editor. Full screenshots are softened by browser capture scaling; focused screenshot is readable.
- Copy/content: exact START/END marker source retained, Chinese labels match selected design, translated labels supplied for all supported language dictionaries.

## Validation

- 16 targeted unit tests passed: exact marker matching, false positives, decoration invalidation after edits, language reconfiguration and unchanged source/selection.
- TypeScript and targeted ESLint passed; renderer production build passed (bundle-size advisory only).
- Browser: copied the whole document and verified badges are absent from clipboard, preserving original source. Switched light/dark via preview preferences and inspected 1000px layout.
- Console inspected: preview setup initially used an unsupported raw HTML route, fixed by serving through Vite's renderer root. Existing preferences emitted a React overflow shorthand warning and unsupported mock helper_status command. Neither originates in the boundary change; final renderer view has no observed boundary-related errors.
- Native Tauri integration and full repository E2E suite were not run. Preview uses test data, not the actual /etc/hosts file.

## Implementation checklist

- [x] Exact complete-line recognition consistent with hosts writer.
- [x] Labels implemented as decorations, not source text.
- [x] Light/dark theme support and live localization.
- [x] Shared editor and history viewer support.
- [x] Unit, type, lint, build and scoped browser verification.

## Follow-up polish

None required for this scope.

## Follow-up: pinned labels and theme-colored outer rules

User requested labels remain visible under horizontal scrolling, and a theme-colored top rule on START / bottom rule on END. This supersedes the earlier acceptance of horizontally scrolling badges out of view.

- Fix: sticky positioning with an 8px right inset on the existing label widgets; original code keeps scrolling normally. No additional source text or scroll event listeners.
- START top and END bottom inset rules now use `--swh-primary-color`; opposite rules keep the subdued boundary token.
- Verification viewport: 1000 × 780 CSS pixels. Full evidence: `tmp/marker-preview/sticky-full.jpg`; focused light: `tmp/marker-preview/sticky-final.jpg`; dark: `tmp/marker-preview/sticky-dark.jpg` (445 × 290 CSS/image pixels at x=310, y=230).
- Tested ordinary overflow and a temporary 6010px-wide document at horizontal offsets 0, 4000 and maximum 5570px. The editor's right edge was x=751px; both badge right edges remained approximately x=743px at all positions. Long-line fixture was restored afterward.
- Compared light and dark focused captures: labels remain within the visible editor, preserve original typography and text, and accent rules are applied to the requested outer edges. No new assets; no remaining P0/P1/P2 findings for this request.
- Targeted 16 unit tests, typecheck, ESLint and whitespace check passed. Native Tauri runtime was not separately exercised.

final result: passed
