import { sameModel, type ModelRef, type Preferences } from "./history"

export type Snapshot = {
  fingerprint: string
  rows: Array<ModelRef & { pickerIndex: number }>
  preferences: Preferences
}

export interface SwitchHost {
  snapshot(): Promise<Snapshot>
  route(): string
  current(): (ModelRef & { variant?: string }) | undefined
  mode(): string
  commands(): Set<string>
  dispatch(id: string): void
  clearDialog(): void
  variants(): readonly string[]
  setVariant(variant: string | undefined): boolean
  notify(message: string): void
  busy(value: boolean): void
}

export function createSwitcher(host: SwitchHost) {
  let active = false
  let disposed = false
  let generation = 0
  return {
    cancel() { generation++ },
    dispose() { disposed = true; generation++ },
    async select(target: ModelRef): Promise<boolean> {
      if (active || disposed) return false
      if (host.mode() !== "base") {
        host.notify("Close the current dialog before switching models.")
        return false
      }
      active = true
      host.busy(true)
      const token = ++generation
      const route = host.route()
      let ownsPicker = false
      const isPicker = () => host.mode() === "modal" && host.commands().has("model.dialog.provider")
      const check = () => {
        if (disposed || token !== generation || host.route() !== route) throw new Error("cancelled")
      }
      const dispatch = (id: string) => {
        check()
        if (!host.commands().has(id)) throw new Error("Model picker commands are unavailable. Use /models.")
        host.dispatch(id)
      }
      try {
        const before = await host.snapshot()
        check()
        if (host.mode() !== "base") throw new Error("cancelled")
        const row = before.rows.find((entry) => sameModel(entry, target))
        if (!row || !Number.isInteger(row.pickerIndex) || row.pickerIndex < 0 || row.pickerIndex > 100)
          throw new Error("This model is no longer in Recent. Open /models.")
        const latest = await host.snapshot()
        check()
        if (host.mode() !== "base") throw new Error("cancelled")
        if (before.fingerprint !== latest.fingerprint) throw new Error("Model history changed; click the model again.")
        // No await from opening through confirmation/closure. In 2.2.5 the
        // picker mounts synchronously; asynchronous focus is irrelevant to
        // direct command dispatch. Never adopt a later generic selection modal.
        dispatch("model.list")
        if (!isPicker()) throw new Error("Native model picker could not be identified. Use /models.")
        ownsPicker = true
        const navigate = (id: string) => {
          if (!isPicker()) throw new Error("Model picker was replaced; selection cancelled.")
          dispatch(id)
        }
        navigate("dialog.select.home")
        for (let index = 0; index < row.pickerIndex; index++) navigate("dialog.select.next")
        navigate("dialog.select.submit")
        if (!sameModel(host.current(), target)) throw new Error("Model selection could not be verified. Use /models.")
        const saved = before.preferences.variant[`${target.providerID}/${target.modelID}`]
        const variant = saved && saved !== "default" && host.variants().includes(saved) ? saved : undefined
        if (!host.setVariant(variant)) throw new Error("Could not restore the model's reasoning setting.")
        // Any modal produced synchronously by this confirmed selection is the
        // host's optional variant picker. It must not require a second click.
        if (host.mode() === "modal") host.clearDialog()
        ownsPicker = false
        return true
      } catch (error) {
        const cancelled = disposed || generation !== token || (error instanceof Error && error.message === "cancelled")
        if (!cancelled) host.notify(error instanceof Error ? error.message : "Cannot switch model. Use /models.")
        if (ownsPicker && !cancelled && isPicker()) host.clearDialog()
        return false
      } finally {
        active = false
        host.busy(false)
      }
    },
  }
}
