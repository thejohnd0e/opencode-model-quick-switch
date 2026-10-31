import { readFile } from "node:fs/promises"

export type ModelRef = { providerID: string; modelID: string }
export type Preferences = { recent: ModelRef[]; favorite: ModelRef[]; variant: Record<string, string> }
export type CatalogModel = { providerID: string; id: string; name: string }
export type HistoryRow = ModelRef & { name: string; provider: string; pickerIndex: number }
export type HistoryEvent = { preferences?: Preferences; error?: string }

export const sameModel = (a: ModelRef | undefined, b: ModelRef | undefined) =>
  a !== undefined && b !== undefined && a.providerID === b.providerID && a.modelID === b.modelID

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function decodePreferences(value: unknown): Preferences {
  if (!record(value) || !Array.isArray(value.recent) || !Array.isArray(value.favorite))
    throw new Error("Native model history is unavailable or invalid")
  const refs = (items: unknown[]): ModelRef[] => items.flatMap((item) =>
    record(item) && typeof item.providerID === "string" && item.providerID.length > 0 &&
    typeof item.modelID === "string" && item.modelID.length > 0
      ? [{ providerID: item.providerID, modelID: item.modelID }] : [])
  return {
    recent: refs(value.recent),
    favorite: refs(value.favorite),
    variant: record(value.variant)
      ? Object.fromEntries(Object.entries(value.variant).filter(([key, v]) => key.length > 0 && typeof v === "string" && v.length > 0)) as Record<string, string>
      : {},
  }
}

export async function readPreferences(file: string): Promise<Preferences> {
  return decodePreferences(JSON.parse(await readFile(file, "utf8")))
}

export function visibleHistory(preferences: Preferences, catalog: readonly CatalogModel[], providers: readonly { id: string; name: string }[]) {
  const valid = (ref: ModelRef) => catalog.some((model) => model.providerID === ref.providerID && model.id === ref.modelID)
  const favorites = preferences.favorite.filter(valid)
  const recent = preferences.recent.filter(valid).filter((ref) => !favorites.some((favorite) => sameModel(ref, favorite)))
  return {
    favorites,
    recent: recent.map((ref, index): HistoryRow => ({
      ...ref,
      name: catalog.find((model) => model.providerID === ref.providerID && model.id === ref.modelID)!.name,
      provider: providers.find((provider) => provider.id === ref.providerID)?.name ?? ref.providerID,
      pickerIndex: favorites.length + index,
    })),
  }
}

// Polling survives atomic rename/recreation on Windows; at most one small read
// per interval, and no write access to the host's history.
export function watchPreferences(file: string, listener: (event: HistoryEvent) => void, interval = 750): () => void {
  let disposed = false
  let reading = false
  let previous = ""
  async function refresh() {
    if (disposed || reading) return
    reading = true
    let event: HistoryEvent
    try { event = { preferences: await readPreferences(file) } }
    catch { event = { error: "Cannot read model history. Open /models or wait for recovery." } }
    reading = false
    const signature = JSON.stringify(event)
    if (disposed || signature === previous) return
    previous = signature
    listener(event)
  }
  void refresh()
  const timer = setInterval(() => void refresh(), interval)
  timer.unref?.()
  return () => { disposed = true; clearInterval(timer) }
}
