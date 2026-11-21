# AGENTS.md — dsh-ui-appearance

English | [中文](#中文)

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

## Post-install handoff (agents)

Tell the owner, in one short message: restart DSH, open **Settings → Appearance (外观)**, pick a wallpaper folder or keep the bundled defaults; everything applies live. No network, no tokens, no server to start.

## Constraints for contributors

- Do not add personal wallpapers or machine paths to the repository or the packed tarball.
- Keep per-frame work out of the streaming hot path (debounced sync, cached measurements).
- `npm test` runs the motion/defaults checks.

---

<a id="中文"></a>

# AGENTS.md — dsh-ui-appearance（中文）

给编码 agent 的机器可读说明。人类文档：[README.md](README.md) / [README.zh-CN.md](README.zh-CN.md)。

## 这个包是什么

一个 DeepSeek Harness Web bundle（`dsh-ui-appearance`）。Host 半负责把用户配置的壁纸文件夹以 HTTP 提供，Client 半负责「外观」设置页和把外观应用到界面。不挂载任何 agent 工具。

## 安装

```sh
git clone https://github.com/LuosuQWQ/dsh-ui-appearance.git
dsh plugin --profile <profile> add link:<本地绝对路径>/dsh-ui-appearance
# 重启 DSH；设置里会出现「外观」
```

## 配置与行为

- 壁纸来源：在设置页选择文件夹（页面用系统文件管理器打开它）；只提供图片文件。
- 自带两张默认壁纸，位于 `assets/backgrounds/`；全新 profile 默认使用 version2。
- 设置存在 DSH 的设置存储里，不在本包内。
- 效果全部是 CSS；除用户自己的 DSH 外不发起任何网络请求。

## 安装后交接（给 agent）

用一句话告诉主人：重启 DSH，打开 **设置 → 外观**，选壁纸文件夹或用自带默认壁纸，改动即时生效。没有网络请求、没有 token、不需要启动服务。

## 贡献约束

- 不要把个人壁纸或本机路径加进仓库或打包产物。
- 每帧工作不要放进流式热路径（用防抖同步、缓存测量值）。
- `npm test` 跑动效与默认值检查。

## 验收

```sh
npm test
```
