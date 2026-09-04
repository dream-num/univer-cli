# Unit Comparison Viewer

`@univer/unit-comparison-viewer` is a copyable React package for rendering a read-only,
side-by-side comparison of Sheet, Doc, Slide, Base, or Board Units.

The package consumes fully decoded `unitData`. It does not fetch comparison sessions, decode wire
payloads, own route state, or create a configured Univer runtime. The host supplies those concerns.

## Usage

Import the package stylesheet after Tailwind CSS so Tailwind v4 scans the package source and emits
the utilities used by the viewer:

```css
@import "tailwindcss";
@import "@univer/unit-comparison-viewer/styles.css";
```

Render the viewer with the comparison result, decoded snapshots, and a host-owned Univer factory:

```tsx
import { UnitComparisonViewer } from "@univer/unit-comparison-viewer";

<UnitComparisonViewer
  key={`${comparison.result.comparisonId}:${comparison.result.unit.unitId}`}
  comparison={comparison}
  createUniver={createComparisonUniver}
  locale={locale}
  darkMode={darkMode}
/>;
```

`key` is the normal external React lifecycle key; it is deliberately not a component prop. Change
it only when the whole comparison session or Unit changes. Sheet selection and Slide page selection
are updated incrementally inside a mounted viewer.

The factory is the integration seam for applications with different presets or plugins:

```ts
import type { UnitComparisonUniverFactory } from "@univer/unit-comparison-viewer";

export const createComparisonUniver: UnitComparisonUniverFactory = async (options) => {
  const univer = createAndConfigureUniver({
    container: options.container,
    unitType: options.unitType,
    locale: options.locale,
    darkMode: options.darkMode,
  });

  return {
    univer,
    dispose: () => univer.dispose(),
  };
};
```

The host factory must register the rendering plugins required for the requested `unitType`, attach
them to `options.container`, and keep the runtime read-only. The viewer creates one factory instance
per visible side and owns calling `dispose()`.

Optional props are:

- `leftHeaderControl`: host UI rendered in the left-side header, such as a comparison-source picker.
- `messages`: localized viewer copy. Without it, the package uses its built-in English messages.

## Copying

Copy this directory as one workspace package and add it to the destination workspace. Its runtime
imports are limited to React, Lucide, and published Univer packages declared in `package.json`; it
does not import another `@univer/*` workspace package. Keep the Univer dependency versions aligned
with the host runtime so dependency-injection tokens resolve to the same SDK modules.
