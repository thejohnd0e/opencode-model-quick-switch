import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { createSignal } from "solid-js"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { isAbsolute, join } from "node:path"
import { readPreferences, visibleHistory, watchPreferences, type HistoryEvent, type ModelRef } from "./history"
import { createSwitcher, type Snapshot } from "./switcher"
import { mountSidebar } from "./sidebar"

async function stateFile(context: Context): Promise<string> {
  const override = context.options.stateFile
  if (typeof override === "string" && isAbsolute(override)) return override
  // Official path resolver honors platform, XDG overrides and release channel.
  // This command neither starts a service nor opens the database.
  const { stdout } = await promisify(execFile)(process.execPath, ["debug", "paths", "state"], { timeout: 5000, windowsHide: true })
  const directory = stdout.trim()
  if (!isAbsolute(directory)) throw new Error("Cannot locate native model history")
  return join(directory, "model.json")
}

export async function activate(context: Context) {
  const [history, setHistory] = createSignal<HistoryEvent>({})
  const [busy, setBusy] = createSignal(false)
  let disposed = false
  let stopWatching = () => {}
  let file: string | undefined
  const models = () => context.data.location.model.list(context.location)
  const providers = () => context.data.location.provider.list(context.location) ?? []
  const rows = () => {
    const preferences = history().preferences
    return preferences ? visibleHistory(preferences, models() ?? [], providers()).recent : []
  }
  const notify = (message: string) => context.ui.toast.show({ title: "Recent models", message, variant: "warning", duration: 4000 })
  const snapshot = async (): Promise<Snapshot> => {
    if (!file) throw new Error("Model history is not ready. Use /models.")
    const preferences = await readPreferences(file)
    const catalog = models()
    if (!catalog?.length) throw new Error("Model catalog is not ready. Use /models.")
    return {
      fingerprint: JSON.stringify([context.location, preferences, catalog.map((model) => [model.providerID, model.id])]),
      rows: visibleHistory(preferences, catalog, providers()).recent,
      preferences,
    }
  }
  const switcher = createSwitcher({
    snapshot,
    route: () => JSON.stringify([context.ui.router.current(), context.location]),
    current: () => context.ui.model.current(),
    mode: () => context.keymap.mode.current(),
    commands: () => new Set(context.keymap.commands().flatMap((command) => command.id ? [command.id] : [])),
    dispatch: (id) => context.keymap.dispatch(id),
    clearDialog: () => context.ui.dialog.clear(),
    variants: () => context.ui.model.variant.list(),
    setVariant: (variant) => context.ui.model.variant.set(variant),
    notify,
    busy: (value) => { if (!disposed) setBusy(value) },
  })
  async function refresh() {
    if (!file || disposed) return
    try {
      const preferences = await readPreferences(file)
      if (!disposed) setHistory({ preferences })
    } catch {
      if (!disposed) setHistory({ error: "Cannot read history" })
    }
  }
  const select = async (target: ModelRef) => {
    const selected = await switcher.select(target)
    if (selected) await refresh()
    return selected
  }
  const openNative = () => {
    if (!busy() && context.keymap.mode.current() === "base") context.keymap.dispatch("model.list")
  }
  // Abort before OpenTUI processes user keys/clicks. Ignore pointer motion and
  // do not consume input: the user takes over the native dialog normally.
  const onInput = (sequence: string) => {
    const mouse = /^\x1b\[<(\d+);\d+;\d+[mM]$/.exec(sequence)
    if (!mouse || (Number(mouse[1]) & 32) === 0) switcher.cancel()
    return false
  }
  context.renderer.prependInputHandler(onInput)
  const unregister = context.ui.slot({
    append: "sidebar.content",
    render: () => mountSidebar({
      rows,
      current: () => context.ui.model.current(), busy,
      status: () => history().error ??
        (!history().preferences || models() === undefined ? "Loading models…" : "ready"),
      theme: () => ({ text: context.theme.text.base, muted: context.theme.text.muted, selected: context.theme.text.formfield.selected }),
      select: (ref) => { void select(ref) }, open: openNative,
    }),
  })
  context.keymap.layer(() => ({
    commands: [{
      id: "recent-models.select", title: "Switch recent model", group: "Recent models",
      palette: true, slash: { name: "recent-models" }, enabled: () => !busy() && rows().length > 0,
      run: async () => {
        if (context.keymap.mode.current() !== "base") return
        const current = context.ui.model.current()
        const target = await context.ui.dialog.select({
          title: "Recent models", current: current ? { providerID: current.providerID, modelID: current.modelID } : undefined,
          options: rows().map((row) => ({ title: row.name, description: row.provider, value: { providerID: row.providerID, modelID: row.modelID } })),
        })
        if (target && !disposed) await select(target)
      },
    }],
  }))
  try {
    file = await stateFile(context)
    if (!disposed) stopWatching = watchPreferences(file, (event) => setHistory(event))
  } catch { setHistory({ error: "Cannot locate model history" }) }
  return {
    select,
    dispose() {
      disposed = true
      switcher.dispose()
      stopWatching()
      context.renderer.removeInputHandler(onInput)
      unregister()
    },
  }
}

export default Plugin.define({
  id: "recent-models",
  async setup(context) {
    const active = await activate(context)
    return () => active.dispose()
  },
})
