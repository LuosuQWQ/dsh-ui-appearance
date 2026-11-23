import fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const NS = 'dsh-ui-appearance'
const userRoot = path.join(process.env.USERPROFILE || process.env.HOME || process.cwd(), '.dsh', 'plugins', NS)
const configuredWorkspace = process.env.DSH_WORKSPACE
const bundledAssets = process.env.DSH_APPEARANCE_ASSETS
const configFile = path.join(userRoot, 'config.json')
const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
/** 随包附带的默认壁纸；没有配置过的用户直接用它。 */
const DEFAULT_WALLPAPER = '/bg/' + encodeURIComponent('花与大肥鱼 version2.png')
/** 包内的只读壁纸目录：npm 安装（没有检出目录）时默认壁纸也从这里提供。 */
const packageAssets = fileURLToPath(new URL('../../assets/backgrounds', import.meta.url))
const defaults = {
  bgImage: DEFAULT_WALLPAPER, bgSize: 'cover', bgOpacity: 1, bgBlur: 0,
  bgMask: '#f8f7f7', bgMaskOpacity: 0,
  parallaxEnabled: true, parallaxAmplitude: 12, parallaxEasing: 'ease-out',
  conversationEnabled: true, conversationOpacity: 0.2, conversationBlur: 2, conversationColor: '#ffffff', conversationWidth: 870,
  chatBoxColor: '#ffffff', chatBoxOpacity: 0.59, chatBoxBlur: 0, chatBoxBorder: 'none', chatBoxRadius: 24,
  newChatBoxColor: '#ffffff', newChatBoxOpacity: 0.9, newChatBoxBlur: 8, newChatBoxBorder: 'thin', newChatBoxRadius: 16,
  existingChatBoxColor: '#ffffff', existingChatBoxOpacity: 0.82, existingChatBoxBlur: 10, existingChatBoxBorder: 'thin', existingChatBoxRadius: 16,
  settingsOpacity: 0.4, settingsBlur: 16, settingsColor: '#ffffff',
  sidebarOpacity: 0.4, sidebarAutoHide: false, prewarmFirstSlide: true,
  previewPopupShared: true, previewPopupInset: 8,
  pageCard: true,
}
const clamp = (n, min, max) => { n = Number(n); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min }
const safeConfig = (value) => {
  const out = { ...defaults, ...(value && typeof value === 'object' ? value : {}) }
  out.bgOpacity = clamp(out.bgOpacity, 0, 1); out.bgBlur = clamp(out.bgBlur, 0, 60)
  out.bgMaskOpacity = clamp(out.bgMaskOpacity, 0, 1); out.parallaxAmplitude = clamp(out.parallaxAmplitude, 0, 50)
  out.conversationOpacity = clamp(out.conversationOpacity, 0, 1); out.conversationBlur = clamp(out.conversationBlur, 0, 60)
  out.settingsOpacity = clamp(out.settingsOpacity, 0, 1); out.settingsBlur = clamp(out.settingsBlur, 0, 60)
  for (const key of ['newChatBoxOpacity', 'existingChatBoxOpacity']) out[key] = clamp(out[key], 0, 1)
  for (const key of ['newChatBoxBlur', 'existingChatBoxBlur', 'newChatBoxRadius', 'existingChatBoxRadius']) out[key] = clamp(out[key], 0, 60)
  out.previewPopupInset = clamp(out.previewPopupInset, 0, 48)
  return out
}
const send = (res, status, data, type = 'application/json') => { res.statusCode = status; if (res.setHeader) res.setHeader('content-type', type); if (type === 'application/json') data = JSON.stringify(data); res.end(data) }

/**
 * Host 的准入检查：Host/Origin 围栏 + 已认证会话。拿不到这个服务就一律
 * 拒绝（503）——宁可这条路不可用，也不能在服务缺席时静默放行。
 */
const rejectionOf = (ctx, req) => {
  const connection = ctx.get?.('connection')
  if (typeof connection?.requestRejection !== 'function') return 503
  try {
    return connection.requestRejection(req)
  } catch {
    return 403
  }
}

export const name = NS
export const inject = ['webServer', 'workspaceRegistry']
const resolveWorkspaceRoot = (ctx) => {
  if (configuredWorkspace) return path.resolve(configuredWorkspace)
  try {
    const workspace = ctx.workspaceRegistry.list()[0]
    if (workspace?.path) return path.resolve(workspace.path)
  } catch {}
  return path.resolve(process.cwd())
}
export function apply(ctx) {
  const root = path.join(resolveWorkspaceRoot(ctx), 'plugins', NS)
  const dir = path.join(root, 'assets', 'backgrounds')
  // 顺序即优先级：用户自己的目录优先，其次是 DSH_APPEARANCE_ASSETS，最后是包内默认壁纸。
  const assetDirs = [...new Set([dir, bundledAssets ? path.resolve(bundledAssets) : null, packageAssets].filter(Boolean).map((item) => path.resolve(item)))]
  const legacyDir = path.join(userRoot, 'assets', 'backgrounds')
  const migrateLegacy = async () => {
    if (path.resolve(legacyDir).toLowerCase() === path.resolve(dir).toLowerCase()) return
    const files = await fs.readdir(legacyDir, { withFileTypes: true }).catch(() => [])
    const images = files.filter((entry) => entry.isFile() && /\.(jpe?g|png|webp|gif)$/i.test(entry.name))
    if (!images.length) return
    await fs.mkdir(dir, { recursive: true })
    for (const entry of images) {
      const source = path.join(legacyDir, entry.name)
      const target = path.join(dir, entry.name)
      try {
        await fs.access(target)
      } catch {
        try {
          await fs.rename(source, target)
        } catch (error) {
          if (error.code !== 'EXDEV') throw error
          await fs.copyFile(source, target)
          await fs.unlink(source)
        }
      }
    }
    await fs.rm(legacyDir, { recursive: false, force: true }).catch(() => {})
  }
  const ready = migrateLegacy().catch(() => {})
  const load = async () => { try { return safeConfig(JSON.parse(await fs.readFile(configFile, 'utf8'))) } catch { return null } }
  const save = async (value) => { await fs.mkdir(userRoot, { recursive: true }); await fs.writeFile(configFile, JSON.stringify(safeConfig(value), null, 2), 'utf8') }
  const route = async (req, res) => {
    // 先过准入：没有这道检查，用户浏览器里任意网页都能 POST /bg/upload 往工作区
    // 写文件、POST /bg/reveal 弹文件管理器、改 /bg/config 改掉整套外观设置。
    const rejection = rejectionOf(ctx, req)
    if (rejection !== undefined) return send(res, rejection, { error: 'unauthorized' })
    await ready
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname === '/bg/list') {
      // 返回 { url, name }：name 是解码后的原文件名。只给 URL 的话，中文文件名会被
      // encodeURIComponent 成 %E5%B0%91%E5%A5%B3，设置页的壁纸下拉框就只能显示乱码。
      const entries = new Map()
      for (const assetDir of assetDirs) {
        for (const file of await fs.readdir(assetDir).catch(() => [])) {
          if (!/\.(jpe?g|png|webp|gif)$/i.test(file) || entries.has(file)) continue
          entries.set(file, { url: '/bg/' + encodeURIComponent(file), name: file })
        }
      }
      return send(res, 200, [...entries.values()])
    }
    if (url.pathname === '/bg/path') return send(res, 200, { path: dir })
    // 设置页的「壁纸文件夹」按钮：在系统文件管理器里打开壁纸目录。
    // 只接受这个固定目录，不接受调用方传入路径。
    if (url.pathname === '/bg/reveal' && req.method === 'POST') {
      await fs.mkdir(dir, { recursive: true }).catch(() => {})
      try {
        const [command, args] = process.platform === 'win32'
          ? ['explorer.exe', [dir]]
          : process.platform === 'darwin'
            ? ['open', [dir]]
            : ['xdg-open', [dir]]
        const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false })
        child.on('error', () => {})
        child.unref()
        return send(res, 200, { opened: true, path: dir })
      } catch (error) {
        return send(res, 500, { error: String(error?.message ?? error) })
      }
    }
    if (url.pathname === '/bg/upload' && req.method === 'POST') {
      let body = Buffer.alloc(0)
      for await (const chunk of req) { body = Buffer.concat([body, chunk]); if (body.length > 12 * 1024 * 1024) break }
      const ext = types[(req.headers['content-type'] || '').split(';')[0]]
      if (!ext || body.length > 12 * 1024 * 1024) return send(res, 415, { error: 'only JPEG/PNG/WebP/GIF up to 12MB' })
      await fs.mkdir(dir, { recursive: true })
      const file = crypto.randomUUID() + '.' + ext
      await fs.writeFile(path.join(dir, file), body)
      return send(res, 201, { url: '/bg/' + encodeURIComponent(file), name: file })
    }
    if (url.pathname === '/bg/config') {
      if (req.method === 'GET') {
        const value = await load()
        return value ? send(res, 200, value) : send(res, 404, { error: 'appearance config not found' })
      }
      if (req.method === 'POST') { const data = JSON.parse((await collect(req)) || '{}'); await save(data); await refreshCfg(); return send(res, 200, activeCfg || safeConfig(data)) }
    }
    if (url.pathname.startsWith('/bg/')) {
      const file = path.basename(decodeURIComponent(url.pathname.slice(4)))
      const clean = file === decodeURIComponent(url.pathname.slice(4))
      if (!clean) return send(res, 400, { error: 'bad filename' })
      const ext = path.extname(file).toLowerCase()
      const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[ext]
      if (!mime) return send(res, 404, { error: 'not found' })
      try {
        for (const assetDir of assetDirs) {
          try {
            const data = await fs.readFile(path.join(assetDir, file))
            return send(res, 200, data, mime)
          } catch {}
        }
        return send(res, 404, { error: 'not found' })
      } catch { return send(res, 404, { error: 'not found' }) }
    }
    res.statusCode = 404; res.end()
  }
  const collect = async (req) => { let body = Buffer.alloc(0); for await (const chunk of req) { body = Buffer.concat([body, chunk]); if (body.length > 1e6) break } return body.toString('utf8') }

  // —— 首帧预加载：把壁纸作为一段极早的 <style> 注入每个被服务页面的 <head>。
  // 这发生在任何外观 JS 之前、HTML 一解析到 <head> 就画出来，所以即使某个首屏页面
  // 因为插件尚未注册而没加载外观 client，也能直接看到壁纸（只要本 host 已 apply，
  // 即 /bg 图片本身也可用）。
  let activeCfg = defaults
  // 同步读好配置：首屏一被服务就立刻有壁纸样式注入，不等异步迁移/读盘。
  try { activeCfg = safeConfig(JSON.parse(readFileSync(configFile, 'utf8'))) } catch { /* config absent yet */ }
  const refreshCfg = async () => { activeCfg = (await load()) || defaults }
  ready.then(() => { void refreshCfg() })
  const backgroundCss = () => {
    const c = activeCfg
    if (!c || !c.bgImage) return null
    const url = String(c.bgImage).replace(/"/g, '\\"')
    const size = c.bgSize === 'contain' ? 'contain' : c.bgSize === 'tile' ? 'auto' : 'cover'
    const repeat = c.bgSize === 'tile' ? 'repeat' : 'no-repeat'
    return `/*dsh-ui-appearance-head*/html{background-color:#ffffff!important;background-image:url("${url}")!important;background-size:${size}!important;background-repeat:${repeat}!important;background-position:center!important}#root{background:transparent!important}`
  }
  ctx.on('webserver/index-inject', (table) => {
    const css = backgroundCss()
    if (css !== null && Array.isArray(table)) table.push({ kind: 'style', placement: 'head', text: css })
  })

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/bg', handler: route }), 'dsh-ui-appearance: bg routes')
}
export { defaults, safeConfig }
