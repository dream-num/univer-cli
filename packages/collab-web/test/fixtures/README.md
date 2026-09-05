# Header browser checks

Run `pnpm --filter @univer/collab-web dev --host 127.0.0.1`, then open
`http://127.0.0.1:5180/test/fixtures/topbar.html`.

The fixture renders the production `Topbar` with application actions replaced by an on-page action
readout. It is a Vite development page, not a production entry point. The sidebar placeholder is
256px wide; its collapsed toggle exercises the Header's existing toggle spacer.

Check 1440, 1300, 1130, 960, 940, 720, and 480px frame widths with Chinese and English labels,
short/default/long names, and ready/preview states. Include draft, stale comparison, conflict,
preview error, merged, and missing-badge states. Check other supported locales at narrow widths,
and dark appearance. Resize in both directions and switch locale/state without reloading.

Expected behavior:

- View/Compare is geometrically centered when both sides fit symmetrically. Otherwise the Header
  flows on one row until its controls and readable title no longer fit, then wraps naturally.
- The title text reserves 100–280px (shorter names keep their intrinsic width). It ellipsizes and
  exposes the full name on hover. The Unit change badge immediately follows the name.
- The full merge status is preferred; its compact form retains the version-change information.
  Conflict and unavailable-preview details remain visible, wrapping if necessary.
- Controls never overlap or clip. A segmented control that cannot fit horizontally stacks and
  supports vertical arrow navigation. Long translated labels can wrap inside stacked controls.
- Compare, preview source, refresh, submit, merge, and discard invoke their own actions. A conflict
  disables merge while keeping discard available. No action in this fixture modifies user data.

`worktree-header-layout.test.tsx` covers measurement decisions and observer cleanup;
`app-worktree-actions.test.tsx` covers application action wiring and status semantics.
