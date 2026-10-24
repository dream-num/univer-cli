# Local Board integration

Use producer tarballs to test unpublished Board changes in the source CLI. This workflow does not publish, merge,
change SDK release gates, or import another checkout's source. Node.js 24, the repository's pnpm version, `tar`,
the normal SDK registry configuration, and an installed supported browser are required.

## Prepare the packages

Build and pack the changed packages using their producer's existing tools. In Univer Pro, build only the needed
plugins, then pack each package into a new output directory:

```bash
pnpm --filter @univerjs-pro/boards --filter @univerjs-pro/boards-ui build
pnpm --filter @univerjs-pro/boards pack --pack-destination <new-output-directory>
pnpm --filter @univerjs-pro/boards-ui pack --pack-destination <new-output-directory>
```

For native mind-map factory or layout changes, also build and pack the changed owner package:

```bash
pnpm --filter @univerjs-pro/boards-mind build
pnpm --filter @univerjs-pro/boards-mind pack --pack-destination <new-output-directory>
```

Check the archives' package names, exports and compiled files. Local Pro packing is not the formal release gate.
Use a unique output path for every build, even when its manifest version has not changed.

The CLI SDK provides dev-version preparation with its full artifact and clean-consumer gates:

```bash
pnpm release -- --version=1.2.0-dev.<unique-id> --prepare-only
```

Run it in a clean SDK checkout; it produces `.release/release-manifest.json` and `.release/tarballs/` without
publishing. It requires resolvable exact dependency pins. Temporary consumer overrides do not satisfy producer
release gates. Keep the producer's manifest and gate evidence alongside the packages. If required producer
artifacts or gate evidence are unavailable, report that validation gap explicitly.

Create a local JSON map outside tracked configuration. Paths are relative to the map, or absolute. Record the
actual producer commit and whether it had source changes when packing; the runner retains this supplied
provenance and computes each archive's SHA-256. An optional `sha256` rejects an unexpected archive:

```json
{
  "@univerjs-pro/boards": {
    "tarball": "./packages/univerjs-pro-boards.tgz",
    "sourceCommit": "0123456789abcdef0123456789abcdef01234567",
    "sourceDirty": true
  }
}
```

Include every unpublished dependency needed by the experiment: the changed Pro Board packages (`boards`,
`boards-ui`, and `boards-mind` when relevant), and CLI SDK
`headless-univer`, `unit-layout-lint`, `unit-layout-lint-command`, `univer-render-page`, `univer-render-runtime`,
and `api-reference`. The runner checks archive identity and rejects source-only `file:`, `link:` or `workspace:`
dependencies. It does not discover adjacent checkouts or replace producer release validation.

## Run and iterate

After the normal workspace install, leave tracked workspace/lock settings unchanged and run:

```bash
pnpm dev:board --map <sdk-tarballs.json> --output <new-evidence-directory>
```

`--store-dir <path>` optionally selects an existing pnpm store. Do not run another install, edit workspace/lock
configuration, or run a second integration workflow in the same checkout during this command. Product source
edits remain available for development. The command:

1. Saves the original workspace/lock bytes and temporarily installs only the explicitly mapped SDK archives.
2. Builds the application's browser bundle, including its render page. It reuses that bundle on subsequent
   runs only when archive hashes, the installed dependency lock, root build configuration and all
   browser-package sources match; no demo applications are built.
3. Runs the CLI client, daemon and content worker from source with `tsx`, using the existing daemon-entry and
   browser-assets environment settings, against a new `.univer` file and isolated `UNIVER_HOME`. It verifies graph planning, stale rejection, a nonempty measured label repair crossing from
   the browser back into headless `execute`, re-lint, Worktree ready/merge and Trunk semantic readback.
4. Checks actual model-only lint exit 2, empty stdout and one stderr JSON, stops only its own daemon, and
   restores the original workspace/lock bytes in `finally`, including on ordinary command failure.

The evidence directory retains command stdout/stderr, package hashes/provenance, source entry paths/hashes,
resolved SDK entry paths/versions/hashes, the result and original
configuration backups. Concurrent workspace edits and post-install lock edits are preserved and reported rather
than overwritten. During installation the lock belongs to pnpm; do not edit it or run another installer.
After an abrupt process kill or machine shutdown, recover configuration from those backups before reinstalling;
the process lock is `node_modules/.cache/board-dev.lock`. Stop the evidence home's daemon before removing its
data. Installed `node_modules` still contains the experiment after configuration restoration; run the normal
`pnpm install --frozen-lockfile` to return to committed dependencies.

For interactive CLI edits, use `pnpm dev -- <command>`. The existing Viewer dev server is
`pnpm --filter @univer/collab-web dev` on port 5180; set `UCB_SERVER` to an application Gateway you own.
The Viewer server does not replace the static render-page bundle required by CLI lint. SDK/browser changes
invalidate the integration bundle fingerprint; CLI-only source edits need no browser rebuild.

This local check exercises the specified Board workflow. It does not replace `pnpm check`, the producers'
release gates, or database validation on each supported platform.
