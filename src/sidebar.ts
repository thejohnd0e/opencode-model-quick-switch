import { createElement, insert, setProp, type JSX } from "@opentui/solid"
import type { RGBA, MouseEvent } from "@opentui/core"
import { sameModel, type HistoryRow, type ModelRef } from "./history"

export interface SidebarView {
  rows(): HistoryRow[]
  current(): ModelRef | undefined
  busy(): boolean
  status(): string
  theme(): { text: RGBA; muted: RGBA; selected: RGBA }
  select(ref: ModelRef): void
  open(): void
}

function element(tag: string, props: Record<string, unknown>, children: JSX.Element[] = []): JSX.Element {
  const node = createElement(tag)
  for (const [key, value] of Object.entries(props)) if (value !== undefined) setProp(node, key, value)
  for (const child of children) insert(node, child)
  return node as unknown as JSX.Element
}

export function mountSidebar(view: SidebarView): JSX.Element {
  // Terminal-native spacing: one cell inset and one line between sections.
  const container = createElement("box")
  setProp(container, "id", "recent-models.sidebar")
  setProp(container, "width", "100%")
  setProp(container, "flexDirection", "column")
  setProp(container, "marginTop", 1)
  insert(container, () => {
    const theme = view.theme()
    const busy = view.busy()
    const rows = view.rows()
    const current = view.current()
    const text = (value: string, fg = theme.text) => element("text", { fg, wrapMode: "none", overflow: "hidden" }, [value])
    const open = element("box", { id: "recent-models.open", width: "100%", onMouseUp: (event: MouseEvent) => {
      if (event.button !== 0 || busy) return
      event.stopPropagation()
      view.open()
    } }, [text("Open /models", theme.muted)])
    return [
      text(busy ? "Recent models · Switching…" : "Recent models", theme.selected),
      ...(view.status() !== "ready" ? [text(view.status(), theme.muted), open]
        : rows.length === 0 ? [text("No recent models", theme.muted), open]
        : rows.map((row) => element("box", {
          id: `recent-models.row.${encodeURIComponent(row.providerID)}/${encodeURIComponent(row.modelID)}`, width: "100%", flexDirection: "column",
          onMouseUp: (event: MouseEvent) => {
            if (event.button !== 0 || busy) return
            event.stopPropagation()
            view.select(row)
          },
        }, [
          text(`${sameModel(current, row) ? "●" : " "} ${row.name}`, sameModel(current, row) ? theme.selected : theme.text),
          text(`  ${row.provider}`, theme.muted),
        ]))),
    ]
  })
  return container as unknown as JSX.Element
}
