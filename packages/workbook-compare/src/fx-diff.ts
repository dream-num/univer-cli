export interface WorkbookComparePaneFxState {
  readonly activeCellLabel: string;
  readonly displayValue: string;
  readonly formula: string;
  readonly selectionLabel: string;
}

export type WorkbookCompareFxDiffContentKind = "formula" | "value" | null;

export interface WorkbookCompareFxDiffSegment {
  readonly kind: "delete" | "equal" | "insert";
  text: string;
}

export interface WorkbookCompareFxDiffPane {
  readonly kind: WorkbookCompareFxDiffContentKind;
  readonly segments: readonly WorkbookCompareFxDiffSegment[] | null;
  readonly text: string;
}

function getComparableContent(state: WorkbookComparePaneFxState): {
  readonly kind: WorkbookCompareFxDiffContentKind;
  readonly text: string;
} {
  if (state.formula) {
    return {
      kind: "formula",
      text: state.formula,
    };
  }

  return {
    kind: "value",
    text: state.displayValue,
  };
}

function tokenizeDiffText(text: string): string[] {
  return (
    text.match(
      /(\r?\n|\s+|\$?[A-Za-z]+\$?\d+|[A-Za-z_]+[A-Za-z0-9_]*|[0-9]+(?:\.\d+)?|[\u3400-\u9fff]|.)/gu,
    ) ?? []
  );
}

function pushSegment(
  segments: WorkbookCompareFxDiffSegment[],
  kind: WorkbookCompareFxDiffSegment["kind"],
  text: string,
): void {
  if (!text) {
    return;
  }

  const previous = segments[segments.length - 1];
  if (previous?.kind === kind) {
    previous.text += text;
    return;
  }

  segments.push({ kind, text });
}

function buildTokenDiff(
  baseText: string,
  currentText: string,
): {
  readonly baseSegments: WorkbookCompareFxDiffSegment[];
  readonly currentSegments: WorkbookCompareFxDiffSegment[];
} {
  const baseTokens = tokenizeDiffText(baseText);
  const currentTokens = tokenizeDiffText(currentText);
  const lcsLengths = Array.from({ length: baseTokens.length + 1 }, () =>
    Array<number>(currentTokens.length + 1).fill(0),
  );

  for (let baseIndex = 1; baseIndex <= baseTokens.length; baseIndex += 1) {
    for (let currentIndex = 1; currentIndex <= currentTokens.length; currentIndex += 1) {
      if (baseTokens[baseIndex - 1] === currentTokens[currentIndex - 1]) {
        lcsLengths[baseIndex]![currentIndex] = lcsLengths[baseIndex - 1]![currentIndex - 1]! + 1;
        continue;
      }

      lcsLengths[baseIndex]![currentIndex] = Math.max(
        lcsLengths[baseIndex - 1]![currentIndex]!,
        lcsLengths[baseIndex]![currentIndex - 1]!,
      );
    }
  }

  const operations: Array<{
    baseText?: string;
    currentText?: string;
    kind: WorkbookCompareFxDiffSegment["kind"];
  }> = [];

  let baseIndex = baseTokens.length;
  let currentIndex = currentTokens.length;

  while (baseIndex > 0 && currentIndex > 0) {
    const baseToken = baseTokens[baseIndex - 1]!;
    const currentToken = currentTokens[currentIndex - 1]!;

    if (baseToken === currentToken) {
      operations.push({ baseText: baseToken, currentText: currentToken, kind: "equal" });
      baseIndex -= 1;
      currentIndex -= 1;
      continue;
    }

    if (lcsLengths[baseIndex - 1]![currentIndex]! >= lcsLengths[baseIndex]![currentIndex - 1]!) {
      operations.push({ baseText: baseToken, kind: "delete" });
      baseIndex -= 1;
      continue;
    }

    operations.push({ currentText: currentToken, kind: "insert" });
    currentIndex -= 1;
  }

  while (baseIndex > 0) {
    operations.push({ baseText: baseTokens[baseIndex - 1]!, kind: "delete" });
    baseIndex -= 1;
  }

  while (currentIndex > 0) {
    operations.push({ currentText: currentTokens[currentIndex - 1]!, kind: "insert" });
    currentIndex -= 1;
  }

  const baseSegments: WorkbookCompareFxDiffSegment[] = [];
  const currentSegments: WorkbookCompareFxDiffSegment[] = [];

  for (const operation of operations.reverse()) {
    if (operation.kind === "equal") {
      pushSegment(baseSegments, "equal", operation.baseText ?? "");
      pushSegment(currentSegments, "equal", operation.currentText ?? "");
      continue;
    }

    if (operation.kind === "delete") {
      pushSegment(baseSegments, "delete", operation.baseText ?? "");
      continue;
    }

    pushSegment(currentSegments, "insert", operation.currentText ?? "");
  }

  return {
    baseSegments,
    currentSegments,
  };
}

export function buildWorkbookCompareFxDiffPanes(input: {
  readonly base: WorkbookComparePaneFxState;
  readonly comparable: boolean;
  readonly current: WorkbookComparePaneFxState;
}): {
  readonly base: WorkbookCompareFxDiffPane;
  readonly current: WorkbookCompareFxDiffPane;
} {
  const baseContent = getComparableContent(input.base);
  const currentContent = getComparableContent(input.current);

  if (!input.comparable || baseContent.kind !== currentContent.kind) {
    return {
      base: {
        kind: baseContent.kind,
        segments: null,
        text: baseContent.text,
      },
      current: {
        kind: currentContent.kind,
        segments: null,
        text: currentContent.text,
      },
    };
  }

  const { baseSegments, currentSegments } = buildTokenDiff(baseContent.text, currentContent.text);

  return {
    base: {
      kind: baseContent.kind,
      segments: baseSegments,
      text: baseContent.text,
    },
    current: {
      kind: currentContent.kind,
      segments: currentSegments,
      text: currentContent.text,
    },
  };
}
