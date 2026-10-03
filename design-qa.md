# Batch domain entry QA

Date: 2026-10-02

final result: passed

## Evidence

- Visual target: local reference image, not checked into the repository (1516 × 1037).
- Implementation: local screenshot, not checked into the repository (1280 × 720).
- Combined comparison: local screenshot, not checked into the repository.
- Browser: Codex in-app browser; light theme, Chinese, editing a saved remote/domain entry with four domains and collapsed results. The preview used isolated E2E fixtures and documentation IP addresses, not live DNS or system hosts.
- CSS viewport: 1280 × 720, device pixel ratio 1. The generated reference includes desktop framing; its drawer region was cropped and normalized to the existing 620px application drawer width. Comparison was of the app-owned drawer, not OS chrome. The combined image is readable enough to inspect typography, input, summary and footer without an additional zoom crop.

## Comparison history

1. P2: the original 20px field spacing and 24px input line height pushed refresh/results below the scroll viewport at 720px height. Evidence: local screenshot, not checked into the repository.
2. Reduced domain-only spacing and input line height. Refresh became visible, but the result summary still ended below the scroll viewport.
3. Domain-only field gap is now 8px, input/gutter use 20px line height with six visible lines, and refresh uses the compact button. The final combined comparison confirms input, refresh, collapsed summary and fixed actions are visible together. Expanded details remain scrollable.

## Fidelity and behavior

- Typography: existing Mantine/system typography retained; domain input and gutter use the existing monospace font at 14px. Long domains can scroll horizontally; result text wraps.
- Layout: existing right drawer and fixed footer retained. Six input rows follow the implementation brief; the generated concept depicted eight. Other hosts sources keep their prior field spacing.
- Tokens: existing red primary action, input borders, light/dark theme variables and semantic result colors retained.
- Assets: existing application icons retained; no raster UI substitutes or new image assets needed.
- Content: line-numbered domain list, count, paste help, provider hint, refresh and expandable per-domain results are present. Existing confirmation wording, saved refresh interval, and fixed fixture timestamps are intentionally retained.
- Manual browser checks: batch create/save, automatic content generation, initial result metadata, editing, and result disclosure. E2E additionally covers invalid lines, duplicate URLs, keyboard behavior, unsaved refresh prevention, partial failure, removal and legacy migration.
- Console checked: existing fixture gaps for `get_data_dir_status`/`helper_status` and a pre-existing Mantine overflow style warning were observed. No domain-feature runtime error was observed.

No remaining actionable P0/P1/P2 visual findings. Validation also passed typecheck, ESLint, 187 frontend unit tests, 239 Rust library tests, 53 E2E tests, and the renderer build. Live external DNS and an installed native release were not exercised by this preview.

## Follow-up correctness review

- Replaced permissive URL splitting with standard URL parsing and validation, including malformed ports and ambiguous backslashes.
- Isolated editor save sessions so a delayed save cannot close a subsequently opened editor or change its selection. Source switching now clears obsolete domain lists and preserves intentional empty drafts.
- Added runtime checks for imported domain lists and resolution metadata so malformed data cannot crash the details panel.
- Prevented older list reloads and rule-count reads from overwriting newer results. Refresh loading states are independent for each hosts entry.
- Regression validation: 225 frontend unit tests, 239 Rust library tests, 53 E2E tests, typecheck, ESLint, and renderer build passed. E2E uses isolated Tauri/DNS fixtures; the existing renderer bundle-size warning remains.

## Second correctness review with independent agents

- Refresh commits now verify the original content and cache metadata, preventing an in-flight request from overwriting a same-ID entry replaced by import/restore. Title, enabled state and interval edits remain compatible with an ongoing refresh.
- UI metadata updates verify node, source, target list and refresh timestamp. Delayed responses no longer overwrite newer results or contaminate a different domain list, including after an editor is reopened or a save completes.
- Malformed imported timestamps render safely, and a numeric legacy URL no longer blocks saving a repaired domain entry.
- Repairing an invalid persisted domain list keeps manual refresh disabled until save, then automatically regenerates content. A new browser regression covers this complete flow.
- URL subscription refresh notifications now ignore leftover DNS metadata from imported files, avoiding a false failure after a successful fetch.
- Three agents independently reviewed the backend, frontend and integration paths. A final cross-review confirmed the fixes without identifying further actionable issues.
- Validation passed: 250 frontend unit tests, 243 Rust library tests, 54 E2E tests, typecheck, ESLint, renderer build and whitespace checks. After the final notification fix, the 9 remote-hosts E2E tests were rerun and passed. E2E uses isolated Tauri/DNS fixtures.

## Third correctness review with independent agents

- Remote form saves now persist the default URL source explicitly. Two queued edits of the same legacy entry cannot leave a domain discriminator paired with a subscription URL and a deleted domain list.
- Legacy cache migration preserves duplicate A records until the exact old generator output has been verified, then removes duplicates without changing address order. A failed first batch lookup retains the previous active mapping; arbitrary subscription comments and disabled mappings remain ineligible as caches.
- Three agents reviewed backend, frontend and integration behavior, and independently cross-checked both fixes. No further high-confidence findings remained in this review.
- Validation passed: 251 frontend unit tests, 244 Rust library tests, 54 E2E tests, typecheck, ESLint, renderer build and whitespace checks. E2E continues to use isolated Tauri/DNS fixtures.

## Fourth correctness review with independent agents

- Resolution details now follow the saved domain list and its order while a refresh is pending. Removed domains disappear, new domains show a separate pending status, and the summary counts only displayed rows. The original cache remains intact for refresh fallback.
- The edit drawer only displays results for a saved DNS source and uses its saved domains. Switching sources or editing a legacy entry's URL draft cannot present an unsaved URL as a pending DNS result.
- Added pending labels in all nine supported language dictionaries and seven regression tests, including an actual save with its automatic refresh held pending. Independent backend and frontend reviews checked metadata acceptance, cache ownership, legacy entries and source switching.
- Validation passed: 258 frontend unit tests, 36 targeted offline Rust tests, 54 E2E tests, typecheck, ESLint, renderer build and whitespace checks. After the final drawer source guard, the 9 remote-hosts E2E tests were rerun and passed. E2E uses isolated Tauri/DNS fixtures; the existing renderer bundle-size warning remains.

## Independent review findings verified on 2026-10-03

- Confirmed and reproduced private DoH templates and request URLs reaching per-domain error metadata. DNS failures now use structured error categories without arbitrary strings; provider setup, proxy setup, response parsing and transport errors retain no private endpoint details. Tests exercise real local HTTP failures and actual manifest persistence plus backup export.
- Confirmed that domain count and total batch duration were unbounded. Saving and refresh target validation now allow at most 100 distinct domains, with localized UI feedback and no silent input truncation. A 60-second batch deadline retains completed results, cancels outstanding requests, and marks remaining domains as timed out so their previous IPs can be retained.
- Confirmed that the background scanner only logged top-level errors. Partial and failed DNS outcomes now produce one warning per node with failed/total counts, counting stale results as failed attempts and omitting endpoint and per-domain error text. A regression captures the logger used by both startup and periodic scans.
- Replaced machine-specific screenshot paths in this record with descriptions of local evidence. The VS Code Tauri launch configuration was verified and required no changes.
- Validation passed: 265 frontend unit tests, 253 Rust library tests, 55 E2E tests, typecheck, ESLint, renderer build, Rust formatting and whitespace checks. Default 5-second frontend timeouts were exceeded by different existing tests on two runs; a standalone rerun with a 15-second CLI timeout passed without source or test assertion changes. E2E uses isolated Tauri/DNS fixtures; Rust HTTP regressions use loopback servers, not external DoH services. The existing renderer bundle-size warning remains.
