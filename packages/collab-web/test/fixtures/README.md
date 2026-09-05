# Header browser checks

Run `pnpm --filter @univer/collab-web dev --host 127.0.0.1`, then open
`http://127.0.0.1:5180/test/fixtures/topbar.html`.

The fixture renders the production `Topbar` with application actions replaced by an on-page action
readout. It is a Vite development page, not a production entry point. The sidebar placeholder is
256px wide; its collapsed toggle exercises the Header's existing toggle spacer.

`Topbar` selects the current-version Header or `WorktreeHeaderConnector`. The connector reads
application data and binds commands to the selected Worktree. `buildWorktreeHeaderModel` converts
selected business facts to presentation data without application or DOM access. The renderer in
`src/ui/worktree-header/` accepts only a `model` and event callbacks; it can be mounted without an
`App` or `AppSnapshot`.

A small layout hook only chooses centered Grid columns or flat Flexbox flow. React renders a
measurement state with unwrapped controls, reads the required width, and settles the final state
in a layout effect before paint. Width changes, presentation changes, and font readiness trigger
remeasurement; row-height changes do not. No measurement copies, text ranges, or imperative
changes to rendered attributes are used.

When symmetric columns fit, View/Compare sits at the Header's geometric center. Otherwise,
`display: contents` removes the trailing wrapper from layout, so title, View/Compare, preview
source, and actions participate in the same wrapping flow. The preview selector cannot form an
independent upper row above View/Compare. CSS handles title truncation and all row/text wrapping.

Check 1440, 1300, 1130, 960, 940, 720, and 480px frame widths with Chinese and English labels,
short/default/long names, and ready/preview states. Include draft, stale comparison, conflict,
preview error, merged, and missing-badge states. Check other supported locales at narrow widths,
and dark appearance. Resize in both directions and switch locale/state without reloading.

Expected behavior:

- View/Compare is geometrically centered when both sides fit symmetrically. Otherwise controls
  share an off-center row until their total width no longer fits, then wrap in DOM order.
- The title group reserves up to 260px (302px with a sidebar toggle). Name text has a 280px maximum
  and shrinks with ellipsis; short names keep their intrinsic width. At supported frame widths of
  480px and above, long names retain at least 100px. The full name is available on hover, and the
  Unit change badge immediately follows it.
- Merge status always shows the complete message. Status text wraps within the title group;
  conflict and unavailable-preview details remain visible.
- Controls never overlap or clip. Segmented controls retain two columns and horizontal keyboard
  navigation at every width. Long labels wrap within the buttons; action groups also wrap.
- Compare, preview source, refresh, submit, merge, and discard invoke their own actions. A conflict
  disables merge while keeping discard available. No action in this fixture modifies user data.

`worktree-header-layout.test.tsx` covers resize recovery, height-only notification handling,
content changes, and observer cleanup. `worktree-header-model.test.ts` covers status and action
rules in a Node environment;
`app-worktree-actions.test.tsx` covers standalone rendering, application action wiring, and status
semantics. Verify layout in a real browser because jsdom does not implement CSS layout.
