import { expect, test } from "bun:test"
import plugin from "./tui"

test("setup reports renderer initialization failures to the host", async () => {
  const failure = new Error("renderer unavailable")
  const context = {
    app: { version: "2.2.7" },
    renderer: { prependInputHandler() { throw failure } },
  }
  await expect(plugin.setup(context as never)).rejects.toThrow("renderer unavailable")
})
