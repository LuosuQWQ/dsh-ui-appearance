# AGENTS.md — dsh-ui-appearance

Machine-actionable notes for coding agents. Human documentation: [README.md](README.md) / [README.zh-CN.md](README.zh-CN.md).

## What this package is

A DeepSeek Harness Web bundle (`dsh-ui-appearance`). A Host half serves the configured wallpaper folder and a Client half adds the Appearance settings page and applies the look. No agent tools are mounted.

## Install

```sh
git clone https://github.com/LuosuQWQ/dsh-ui-appearance.git
dsh plugin --profile <profile> add link:<absolute path>/dsh-ui-appearance
# restart DSH; Settings -> Appearance appears
```

## Config and behavior

- Wallpaper source: a folder chosen in the settings page (the page opens it with the OS file manager); only image files are served.
- Two default wallpapers ship in `assets/backgrounds/`; fresh profiles start on version 2.
- Settings live in the DSH settings store, not in this package.
- Effects are CSS-only; no network calls beyond the user's own DSH.

## Constraints for contributors

- Do not add personal wallpapers or machine paths to the repository or the packed tarball.
- Keep per-frame work out of the streaming hot path (debounced sync, cached measurements).
- `npm test` runs the motion/defaults checks.
