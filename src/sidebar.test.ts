import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { createSignal } from "solid-js"
import { mountSidebar, type SidebarView } from "./sidebar"

test("rendered rows disambiguate providers, mark current model, and accept clicks across the full row", async () => {
  const clicks: string[] = []
  const [busy, setBusy] = createSignal(false)
  const view: SidebarView = {
    rows: () => [{ providerID: "alpha", modelID: "same", name: "Same model", provider: "Alpha", pickerIndex: 0 }, { providerID: "beta", modelID: "same", name: "Same model", provider: "Beta", pickerIndex: 1 }],
    current: () => ({ providerID: "beta", modelID: "same" }),
    status: () => "ready", busy,
    theme: () => ({ text: RGBA.fromHex("#eeeeee"), muted: RGBA.fromHex("#aaaaaa"), selected: RGBA.fromHex("#ffff00") }),
    select: (ref) => { clicks.push(ref.providerID) }, open: () => {},
  }
  const t = await testRender(() => mountSidebar(view), { width: 34, height: 16 })
  try {
    await t.renderOnce()
    const frame = t.captureCharFrame()
    expect(frame).toContain("Recent models")
    expect(frame).toContain("Alpha")
    expect(frame).toContain("Beta")
    expect(frame).toContain("● Same model")
    const row = t.renderer.root.findDescendantById("recent-models.row.beta/same")!
    expect(row.width).toBe(34)
    await t.mockMouse.click(row.x + 28, row.y)
    expect(clicks).toEqual(["beta"])
    setBusy(true)
    await t.renderOnce()
    expect(t.captureCharFrame()).toContain("Switching")
    const busyRow = t.renderer.root.findDescendantById("recent-models.row.alpha/same")!
    await t.mockMouse.click(busyRow.x + 20, busyRow.y)
    expect(clicks).toEqual(["beta"])
  } finally { await t.dispose() }
})

test.each(["Loading models…", "Cannot read history", "ready"])("narrow/empty sidebar state %s remains readable and opens the native picker", async (status) => {
  let opened = false
  const t = await testRender(() => mountSidebar({
    rows: () => [], current: () => undefined, busy: () => false, status: () => status,
    theme: () => ({ text: RGBA.fromHex("#eeeeee"), muted: RGBA.fromHex("#aaaaaa"), selected: RGBA.fromHex("#ffff00") }),
    select: () => {}, open: () => { opened = true },
  }), { width: 20, height: 12 })
  try {
    await t.renderOnce()
    expect(t.captureCharFrame()).toContain("Recent models")
    const open = t.renderer.root.findDescendantById("recent-models.open")!
    await t.mockMouse.click(open.x + 2, open.y)
    expect(opened).toBe(true)
    expect(t.captureCharFrame().split("\n").every((line) => line.length <= 20)).toBe(true)
  } finally { await t.dispose() }
})
