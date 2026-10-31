# OpenCode Model Quick Switch

**Switch between recently used models with one click, directly from the OpenCode terminal sidebar.**

Adds a compact **Recent models** section below the other sidebar blocks. It follows OpenCode's native Recent history rather than maintaining a separate list.

```text
Recent models
● Current model
  Provider A
  Another recent model
  Provider B
```

## Features

- Click either line of a row to switch the exact provider/model pair.
- Native Recent order, excluding favorites and unavailable models like the built-in picker.
- `●` marks the actual selected model; provider names distinguish similar model names.
- Restores supported saved reasoning, otherwise uses the model default, without a follow-up dialog.
- Leaves unsent prompt text untouched.
- Keyboard alternative: `/recent-models` or **Switch recent model** in the command palette. No global shortcut is reserved.
- Shows loading, empty and unreadable-history states; checks for recovery automatically.
- No model requests, prompt submission, credential changes or separate history writes.

## Compatibility

**Currently enabled only on OpenCode 2.2.5.**

OpenCode's inspected public TUI API has no direct model setter or native Recent accessor. This plugin reads local native preferences and drives the existing model picker using its commands. All asynchronous checks finish before opening the picker; opening, navigation, confirmation and optional variant-dialog closure run synchronously. A native-picker-specific command must be present before navigation.

Because this workaround depends on the host picker, other OpenCode versions show a warning and disable one-click switching until compatibility is verified. Do not remove the version guard without checking the host behavior.

Tested live on Windows with OpenCode 2.2.5. Production path handling uses the official `opencode debug paths state` resolver; other operating systems and remote-server use have not been live-tested. Sidebar visibility and width remain controlled by OpenCode.

## Install from npm

Requires OpenCode 2.2.5. Add the package name to the `plugins` array in your global `~/.config/opencode/cli.json`, preserving existing settings and plugin entries:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["opencode-model-quick-switch"]
}
```

OpenCode installs package plugins through npm. Use `/reload` if the running TUI has not loaded it yet.

## Install from source

Requires Bun and OpenCode 2.2.5. Use this method if you prefer a local checkout over the npm package.

```sh
git clone https://github.com/thejohnd0e/opencode-model-quick-switch.git
cd opencode-model-quick-switch
bun install --frozen-lockfile --ignore-scripts
bun run build
```

Add the **absolute path to the cloned directory** to `plugins` in your global `~/.config/opencode/cli.json`, preserving existing settings and plugin entries:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["/absolute/path/to/opencode-model-quick-switch"]
}
```

On Windows, use forward slashes in the JSON path, for example `C:/plugins/opencode-model-quick-switch`.

This is a **TUI-only plugin**; configure it in `cli.json`, not the server configuration. OpenCode watches CLI configuration; use `/reload` if reconciliation is needed. No service restart is required.

## Usage and safety

Click a recent model in the session sidebar. The current-model marker updates from host state, while native history changes appear within approximately 750 ms. Long names are clipped to the sidebar width; the provider remains on the next line.

Only one switch runs at a time. An existing modal blocks switching. User input, disposal, changed route/history/catalog or an unidentified native picker aborts the operation. A cancelled picker may remain available for manual use. Missing or malformed preferences fail closed rather than guessing a row.

The native model picker may briefly flash. This is not a direct model-setter integration. The operation verifies the selected provider/model, but cannot provide atomic synchronization with another TUI instance changing native preferences at the same instant.

Optional plugin option `stateFile` accepts an absolute path to native model preferences. Normally omit it; automatic resolution respects the host's platform, channel and XDG settings.

## Update / remove

To update, pull the repository, install with the frozen lockfile and rebuild. Use `/reload` if the running TUI has not reloaded the rebuilt module.

To remove, delete only this directory's plugin entry from `cli.json`. Model history and authentication remain intact.

## Development

```sh
bun install --frozen-lockfile --ignore-scripts
bun run test
bun run typecheck
bun run build
```

The 25 automated tests cover real preference files and atomic replacement recovery, exact provider/model identity, favorite-adjusted picker offsets, guarded selection, foreign dialogs, single-flight/cancellation, saved/default reasoning and actual OpenTUI rendering/clicks at 20 and 34 columns.

Separate pre-publication live checks exercised six sidebar selections across providers in a temporary empty session, draft preservation, reasoning/default, native Recent updates, foreign-modal refusal, history recovery and placement below another sidebar block. The machine-specific live harness is not distributed in this repository. No model prompts were submitted by those checks.

## License

MIT © thejohnd0e, 2026. See [LICENSE](LICENSE).
