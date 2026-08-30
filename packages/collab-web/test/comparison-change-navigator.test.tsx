import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { setLang } from "../src/i18n"
import { ComparisonChangeNavigator } from "../src/ui/comparison-change-navigator"

describe("ComparisonChangeNavigator", () => {
  let root: Root | undefined

  beforeEach(async () => {
    await setLang("en-US")
    document.body.innerHTML = '<main id="root"></main>'
  })

  afterEach(() => {
    root?.unmount()
    root = undefined
    document.body.innerHTML = ""
  })

  it("renders agent semantic paths as human-readable labels with inline text hunks", () => {
    const onNext = vi.fn()
    const onPrevious = vi.fn()
    root = createRoot(document.getElementById("root")!)
    flushSync(() =>
      root?.render(
        <ComparisonChangeNavigator
          changeIndex={1}
          item={{
            kind: "update",
            label: "Publish plan",
            changes: [
              {
                path: ["text"],
                kind: "update",
                valueType: "text",
                before: "Plan 2025",
                after: "Plan 2026",
                segments: {
                  left: [
                    { kind: "equal", text: "Plan 202" },
                    { kind: "delete", text: "5" }
                  ],
                  right: [
                    { kind: "equal", text: "Plan 202" },
                    { kind: "insert", text: "6" }
                  ]
                }
              },
              {
                path: ["geometry", "x"],
                kind: "update",
                valueType: "geometry",
                before: 120,
                after: 160
              }
            ]
          }}
          total={3}
          onNext={onNext}
          onPrevious={onPrevious}
        />
      )
    )

    const navigator = document.querySelector('[data-testid="comparison-change-navigator"]')
    expect(navigator?.textContent).toContain("Publish plan")
    expect(navigator?.textContent).toContain("Text")
    expect(navigator?.textContent).toContain("Horizontal position")
    expect(navigator?.textContent).not.toContain("geometry.x")
    expect(navigator?.textContent).toContain("2 / 3")
    const buttons = [...(navigator?.querySelectorAll("button") ?? [])]
    buttons[0]?.click()
    buttons[1]?.click()
    expect(onPrevious).toHaveBeenCalledOnce()
    expect(onNext).toHaveBeenCalledOnce()
  })

  it("summarizes whole structured entities instead of printing raw JSON", () => {
    root = createRoot(document.getElementById("root")!)
    flushSync(() =>
      root?.render(
        <ComparisonChangeNavigator
          changeIndex={0}
          item={{
            kind: "insert",
            entityLabel: "Code block",
            label: "Code block · TypeScript",
            changes: [
              {
                path: [],
                kind: "insert",
                valueType: "object",
                after: { id: "opaque-code-id", language: "typescript", theme: "dark" }
              }
            ]
          }}
          total={1}
          onNext={vi.fn()}
          onPrevious={vi.fn()}
        />
      )
    )

    const text = document.querySelector('[data-testid="comparison-change-navigator"]')?.textContent
    expect(text).toContain("Added · Code block")
    expect(text).not.toContain("opaque-code-id")
    expect(text).not.toContain("typescript\"")
  })
})
