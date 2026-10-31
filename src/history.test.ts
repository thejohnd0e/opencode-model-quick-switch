import { expect, test } from "bun:test"
import { mkdtemp, writeFile, rename, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decodePreferences, readPreferences, visibleHistory, watchPreferences } from "./history"

const a = { providerID: "a", modelID: "shared" }
const b = { providerID: "b", modelID: "shared" }
const missing = { providerID: "gone", modelID: "old" }
const catalog = [
  { providerID: "a", id: "shared", name: "Same name" },
  { providerID: "b", id: "shared", name: "Same name" },
]

test("Recent keeps native order and distinguishes identical labels by provider", () => {
  const result = visibleHistory({ recent: [b, a], favorite: [], variant: {} }, catalog, [{ id: "a", name: "Alpha" }])
  expect(result.recent.map((row) => [row.providerID, row.provider, row.pickerIndex])).toEqual([["b", "b", 0], ["a", "Alpha", 1]])
})

test("valid favorites shift picker offsets; missing favorites and models do not", () => {
  const result = visibleHistory({ recent: [missing, b, a], favorite: [missing, a], variant: {} }, catalog, [])
  expect(result.recent).toHaveLength(1)
  expect(result.recent[0]).toMatchObject({ ...b, pickerIndex: 1 })
})

test("malformed root fails closed while invalid entries are filtered like the host", () => {
  for (const value of [null, [], {}, { recent: "wrong", favorite: [] }]) expect(() => decodePreferences(value)).toThrow()
  expect(decodePreferences({ recent: [null, {}, a], favorite: [], variant: { "a/shared": "high", wrong: 4 } }))
    .toEqual({ recent: [a], favorite: [], variant: { "a/shared": "high" } })
})

test("empty history stays empty, without inventing a current model entry", () => {
  expect(visibleHistory({ recent: [], favorite: [], variant: {} }, catalog, []).recent).toEqual([])
})

test("reader rejects truncated JSON; watcher recovers after atomic replacement", async () => {
  const dir = await mkdtemp(join(tmpdir(), "recent-history-"))
  const file = join(dir, "model.json")
  const events: Array<{ preferences?: unknown; error?: string }> = []
  let stop = () => {}
  try {
    await writeFile(file, "{")
    await expect(readPreferences(file)).rejects.toThrow()
    stop = watchPreferences(file, (event) => events.push(event), 20)
    await Bun.sleep(70)
    expect(events.some((event) => event.error)).toBe(true)
    await writeFile(join(dir, "new.json"), JSON.stringify({ recent: [b], favorite: [], variant: {} }))
    await rename(join(dir, "new.json"), file)
    for (let i = 0; i < 30 && !events.some((event) => event.preferences); i++) await Bun.sleep(20)
    expect(events.at(-1)?.preferences).toEqual({ recent: [b], favorite: [], variant: {} })
    stop()
    const count = events.length
    await writeFile(file, "{")
    await Bun.sleep(60)
    expect(events).toHaveLength(count)
  } finally {
    stop()
    await rm(dir, { recursive: true, force: true })
  }
})
