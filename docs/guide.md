# SwitchHosts guide

[← README](../README.md) · [简体中文](guide.zh_hans.md)

## Editing and applying hosts

All platforms automatically keep local edits as drafts. Drafts are separate from committed source files, so background remote updates cannot apply unfinished edits. The status bar shows **Pending application**, with **Apply** and **Discard draft** actions.

Leaving the editor for another control or entry applies pending drafts; **Ctrl+S** (Windows/Linux) or **Cmd+S** (macOS) applies them explicitly. Clicking a hosts/group switch combines the draft and selection into one application. The source files and selection are committed together after system application succeeds. A failed application keeps the drafts; a failed source/configuration commit uses the existing system-hosts compensation flow.

Closing or leaving the application keeps drafts pending without starting an application. Reopening an entry restores its draft without applying it. Drafts are stored locally per data directory and entry, outside the exported hosts backup. If the committed source changes elsewhere during editing, application is rejected rather than overwriting it; keep/copy the draft or discard it to reload the saved source.

The save shortcut applies drafts only from an editable local entry. Damaged drafts can be discarded from the load-error message after confirmation. Drafts in the trashcan are kept for restoration; drafts for permanently removed entries are cleaned up when the main window reloads the list or trashcan. Even an unselected draft currently uses the shared application transaction: selected sources and system hosts must be readable. If those reads fail, the draft stays pending for retry.

## Backup

SwitchHosts stores data at `~/.SwitchHosts` (Or folder `.SwitchHosts` under the current user's home
path on Windows). In the v5 data layout:

- `~/.SwitchHosts/manifest.json` stores the hosts tree
- `~/.SwitchHosts/entries/` stores local and remote hosts content
- `~/.SwitchHosts/trashcan.json` stores trashcan entries
- `~/.SwitchHosts/internal/config.json` stores preferences
- `~/.SwitchHosts/internal/histories/` stores system hosts and command run history

For a complete manual backup, copy the whole `~/.SwitchHosts` folder. The in-app export creates a hosts data backup JSON; it does not include preferences or histories.

System hosts are written as UTF-8 without a BOM. Before converting an existing Windows ANSI or BOM-marked UTF-16 file, SwitchHosts saves its original bytes in `internal/histories/hosts-encoding-backups/` under the active data directory, even when history recording is disabled. These `.bin` backups are not removed by the history limit or included in the in-app JSON export.

## HTTP refresh completion

`GET /api/refresh?id=<entry-id>` waits for fetching and saving the remote entry and, when its content changes, for the backend to synchronize the active hosts configuration. Applying may require an OS authorization dialog. The request has no overall authorization timeout: it can remain pending until the user responds. A configured post-apply command can add up to 30 seconds.

Script clients should set their own request timeout. A client timeout does not cancel backend work or prove that the refresh failed; inspect the entry and application recovery state in SwitchHosts before retrying. An `apply_failed` response can include `changed: true` and the refreshed node in `data`: the source was saved, but system application failed. If another application is already awaiting confirmation/recovery, content synchronization is deferred; refresh success is not a guarantee that deferred content is already active.

Find replacements return after saving their source files. Pending find changes are recorded in `internal/pending-content-sync.json` before the source writes, retried against the saved configuration on startup, and cleared after successful reconciliation. This also works when no main window is open. If this pending record is malformed or has been replaced by a directory, use **Reapply Saved Settings** to reconcile the saved configuration; after successful reconciliation, the invalid record is preserved as `pending-content-sync.invalid-*` and find becomes available again. When the saved configuration has no selected sources, recovery first reads and preserves the current system hosts file without changing the existing recovery state. After acknowledgement, it still retries any outstanding reconciliation from an earlier confirmed selection apply, including clearing content after a concurrent deselection. A damaged dirty record alone cannot authorize that empty write. An ordinary toggle that disables the last source still applies the empty selection. Permission and transient I/O errors retain the original record until access is restored.

## Develop and build

### Prerequisites

- [Node.js](https://nodejs.org/) 24 LTS
- [Rust](https://www.rust-lang.org/tools/install) >= 1.90
- Tauri system dependencies, see [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Development

Run the following commands from the repository root. The build output path is also relative to the repository root.

- Run `npm install` to install dependencies
- Run `npm run tauri:dev` to start the app in development mode

### Build and package

- Run `npm run tauri:build` to create a production build
- The packaged files will be in `./src-tauri/target/release/bundle/`

```bash
# development
npm run tauri:dev

# production build
npm run tauri:build
```
