import { expect, test } from "bun:test"
import { createSwitcher, type SwitchHost, type Snapshot } from "./switcher"

const target = { providerID: "b", modelID: "shared" }
function fixture(options: { saved?: string; variants?: string[]; wrong?: boolean; unavailable?: boolean; change?: string } = {}) {
  let mode = "base"
  let nativePicker = false
  let selected = 0
  let current = { providerID: "a", modelID: "shared", variant: "high" as string | undefined }
  let calls = 0
  let closes = 0
  const commands: string[] = []
  const notices: string[] = []
  const busy: boolean[] = []
  const rows = [{ providerID: "a", modelID: "shared" }, { providerID: "favorite", modelID: "one" }, target]
  const host: SwitchHost = {
    snapshot: async (): Promise<Snapshot> => {
      calls++
      if (calls > 1 && options.change === "dialog") { mode = "modal"; nativePicker = false }
      return { fingerprint: calls > 1 && options.change === "history" ? "changed" : "original", rows: [{ ...target, pickerIndex: 2 }], preferences: { recent: [target], favorite: [], variant: options.saved ? { "b/shared": options.saved } : {} } }
    },
    route: () => calls > 1 && options.change === "route" ? "other-session" : "session",
    current: () => current,
    mode: () => mode,
    commands: () => new Set(mode === "base" ? ["model.list"] : options.unavailable ? [] : [...(nativePicker ? ["model.dialog.provider"] : []), "dialog.select.home", "dialog.select.next", "dialog.select.submit"]),
    dispatch: (id) => {
      commands.push(id)
      if (id === "model.list") { mode = "modal"; nativePicker = true }
      if (id === "dialog.select.home") selected = 0
      if (id === "dialog.select.next") selected++
      if (id === "dialog.select.submit") {
        const ref = options.wrong ? rows[0] : rows[selected]
        current = { ...ref, variant: undefined }
        nativePicker = false
      }
    },
    clearDialog: () => { closes++; mode = "base"; nativePicker = false },
    variants: () => options.variants ?? ["high"],
    setVariant: (variant) => { current = { ...current, variant }; return true },
    notify: (message) => { notices.push(message) },
    busy: (value) => { busy.push(value) },
  }
  return { host, commands, notices, busy, current: () => current, closes: () => closes, setModal: () => { mode = "modal" } }
}

test("exact provider/model is selected at favorite-adjusted offset with saved reasoning and no leftover dialog", async () => {
  const f = fixture({ saved: "high" })
  expect(await createSwitcher(f.host).select(target)).toBe(true)
  expect(f.current()).toEqual({ ...target, variant: "high" })
  expect(f.commands).toEqual(["model.list", "dialog.select.home", "dialog.select.next", "dialog.select.next", "dialog.select.submit"])
  expect(f.closes()).toBe(1)
  expect(f.busy).toEqual([true, false])
})

test.each([undefined, "default", "no-longer-supported"])("missing/default/unsupported reasoning %s selects default", async (saved) => {
  const f = fixture({ saved })
  expect(await createSwitcher(f.host).select(target)).toBe(true)
  expect(f.current().variant).toBeUndefined()
})

test("an unrelated modal is not replaced or closed", async () => {
  const f = fixture()
  f.setModal()
  expect(await createSwitcher(f.host).select(target)).toBe(false)
  expect(f.commands).toEqual([])
  expect(f.closes()).toBe(0)
})

test("a foreign selection dialog replacing the picker during its opening is never submitted or closed", async () => {
  const f = fixture()
  const dispatch = f.host.dispatch
  f.host.dispatch = (id) => {
    dispatch(id)
    if (id === "model.list") {
      const commands = f.host.commands
      f.host.commands = () => new Set([...commands()].filter((command) => command !== "model.dialog.provider"))
    }
  }
  expect(await createSwitcher(f.host).select(target)).toBe(false)
  expect(f.commands).not.toContain("dialog.select.submit")
  expect(f.closes()).toBe(0)
})

test("no asynchronous user/plugin work can interleave between opening and confirming the native picker", async () => {
  const f = fixture()
  const events: string[] = []
  const dispatch = f.host.dispatch
  f.host.dispatch = (id) => {
    if (id === "model.list") queueMicrotask(() => events.push("asynchronous-work"))
    dispatch(id)
    if (id === "dialog.select.submit") events.push("submit")
  }
  expect(await createSwitcher(f.host).select(target)).toBe(true)
  expect(events).toEqual(["submit", "asynchronous-work"])
})

test("rapid second click is rejected, not queued", async () => {
  const f = fixture()
  const switcher = createSwitcher(f.host)
  const first = switcher.select(target)
  expect(await switcher.select(target)).toBe(false)
  expect(await first).toBe(true)
  expect(f.commands.filter((id) => id === "model.list")).toHaveLength(1)
})

test.each(["history", "route", "dialog"])("changed %s aborts before confirmation", async (change) => {
  const f = fixture({ change })
  expect(await createSwitcher(f.host).select(target)).toBe(false)
  expect(f.commands).not.toContain("dialog.select.submit")
  if (change === "dialog") expect(f.closes()).toBe(0)
})

test.each(["cancel", "dispose"] as const)("%s stops in-flight work and never confirms", async (action) => {
  const f = fixture()
  const switcher = createSwitcher(f.host)
  const pending = switcher.select(target)
  switcher[action]()
  expect(await pending).toBe(false)
  expect(f.commands).toEqual([])
})

test("unavailable native picker commands fail closed without submitting", async () => {
  const f = fixture({ unavailable: true })
  expect(await createSwitcher(f.host).select(target)).toBe(false)
  expect(f.commands).not.toContain("dialog.select.submit")
  expect(f.notices.length).toBeGreaterThan(0)
})

test("wrong result reports failure instead of success and does not change reasoning", async () => {
  const f = fixture({ wrong: true, saved: "high" })
  expect(await createSwitcher(f.host).select(target)).toBe(false)
  expect(f.current().providerID).toBe("a")
  expect(f.current().variant).toBeUndefined()
  expect(f.notices.length).toBeGreaterThan(0)
})

test("malformed preferences fail closed before opening the picker", async () => {
  const f = fixture()
  f.host.snapshot = async () => { throw new Error("Invalid history") }
  expect(await createSwitcher(f.host).select(target)).toBe(false)
  expect(f.commands).toEqual([])
})
