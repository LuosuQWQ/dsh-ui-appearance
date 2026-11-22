#!/usr/bin/env node
/**
 * dsh-ui-appearance「动效预算」静态回归测试（无第三方依赖）。
 *
 * 为什么要静态断言而不是跑 DOM：jsdom 不实现 transition/合成层，测不出"滑入是否卡"，
 * 但能测出"代码里还有没有逐帧重活"这类结构性错误——那才是首次滑入掉帧的成因。
 *
 * 运行：node test/appearance-motion.cjs
 */
const fs = require('node:fs')
const path = require('node:path')

const FILE = path.join(__dirname, '..', 'lib', 'client', 'index.js')
const source = fs.readFileSync(FILE, 'utf8')

let failed = 0
const check = (name, ok, detail) => {
  if (ok) {
    console.log(`  ok   ${name}`)
    return
  }
  failed += 1
  console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
}
const slice = (start, end) => {
  const from = source.indexOf(start)
  if (from < 0) return ''
  const to = end ? source.indexOf(end, from) : source.length
  return source.slice(from, to < 0 ? source.length : to)
}
const count = (needle) => source.split(needle).length - 1
// 去掉行注释再匹配：注释里会提到 applyBackground 之类的名字，不能算数。
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).map((line) => line.replace(/\/\/.*$/, '')).join('\n')
// 取出一个反引号模板字面量的内容（CSS 里不含反引号）。
const templateOf = (marker) => {
  const at = source.indexOf(marker)
  if (at < 0) return ''
  const start = source.indexOf('`', at)
  if (start < 0) return ''
  const end = source.indexOf('`', start + 1)
  return end < 0 ? '' : source.slice(start + 1, end)
}

console.log('appearance-motion')

// —— 1. 结构：动画期间不得直接跑全量 applyBackground ——
const runSync = slice('const runSync = () => {', 'const scheduleSync')
check('合并同步存在于 runSync', runSync.includes('applyBackground(current, theme)'))
check('runSync 先判断动效窗口', runSync.includes('motionActive()') && runSync.indexOf('motionActive()') < runSync.indexOf('applyBackground'))

const observer = slice('const mo = new MutationObserver((records) => {', 'mo.observe(document.body')
check('MutationObserver 回调里不再直接 applyBackground', observer.length > 0 && !observer.includes('applyBackground'))
check('MutationObserver 回调走合并同步', observer.includes('scheduleSync()'))
check('右栏展开被登记为动效窗口', observer.includes("attributeName === 'data-sidebar-right-open'") && observer.includes('enterMotion(420)'))

const columns = stripComments(slice('const scheduleColumns = () => {', 'const watchColumns'))
check('centerCol 的 ResizeObserver 只同步几何', columns.includes('syncFrameNow()') && !columns.includes('applyBackground'))
// 回归：syncFrameNow 以前用缓存宽度写左轨 → 拖左分界线时把宽度按回去（拖不动）。
check('左轨宽度以官方 inline 第一轨为准', source.includes('frameSidebarTrackPx(raw)'))
check('读到的左轨宽度会回写缓存（但不会被 56px 窄栏覆盖）', /if \(nativeSidebarPx > 200\) sidebarWideWidth = nativeSidebarPx/.test(source))
check('拖拽结束补一次同步', source.includes('onPointerRelease') && source.includes("addEventListener('pointerup', onPointerRelease, true)"))

const hover = slice('const applySidebarHover = (e) => {', 'const sidebarHover = (e)')
check('Hover 只在展开状态变化时写样式', hover.includes("=== String(revealed)) return"))
check('Hover 不逐次量 rect 之后再写样式（侧栏宽度走缓存）', !hover.includes('root.getBoundingClientRect().width'))

const syncRoot = slice('const syncSidebarRoot = (sidebar, autoHide, instant) => {', '// applyBackground 的"几何半"')
// 回归：收起偏移曾只用缓存宽度。缓存会被窄栏(56px)/过渡中间值写小，也会在自动隐藏
// 期间不再刷新，于是收起只推出去缓存那么多 → 左边残留一条缝或半截侧栏。
check('收起偏移按真实宽度计算', syncRoot.includes('root.getBoundingClientRect().width') && syncRoot.includes('measuredWidth'))
check('收起偏移取"实测宽度 / 缓存"较大值', /Math\.max\(\s*measuredWidth > 50 \? measuredWidth : 0/.test(syncRoot))
check('syncSidebarRoot 回写缓存也不被窄栏覆盖', /if \(measuredWidth > 200\) sidebarWideWidth = measuredWidth/.test(syncRoot))
check('点击开关回写缓存同样只认展开宽度', /measuredWidth > 200.*sidebarWideWidth = measuredWidth/.test(source))
check('首次展开瞬时定位', syncRoot.includes('firstReveal') && syncRoot.includes("transition', 'none'"))
check('瞬时定位后会还回过渡（带令牌，避免旧回调覆盖）', syncRoot.includes('sidebarInstantToken'))
check('同步路径会清掉预热用的临时 opacity', syncRoot.includes("removeProperty('opacity')"))

const prewarm = slice('const prewarmSidebar = () => {', 'const sidebarStyleState')
check('存在静默预热', prewarm.length > 0)
check('预热用的是不可见透明度而不是 visibility', prewarm.includes("opacity', '0.002'"))
check('预热期间不吃指针事件', prewarm.includes("pointer-events', 'none'"))
check('预热有兜底回收（后台标签页 rAF 不跑）', prewarm.includes('setTimeout(finish, 400)'))
check('预热结束会清掉临时样式', prewarm.includes("removeProperty('opacity')") && prewarm.includes("removeProperty('pointer-events')"))

const click = slice('const sidebarToggleClick = (e) => {', "window.addEventListener('pointerdown'")
check('点击开关不再同步跑 applyBackground', !click.includes('applyBackground('))
check('点击开关会开启动效窗口', click.includes('enterMotion(340)'))

// —— 2. 样式：右栏毛玻璃在滑动期间摘掉 + 内容延迟入场 ——
const popup = slice('const POPUP_STYLE = `', 'const appearanceRootStyles')
check('滑动期间摘掉 backdrop-filter', popup.includes('data-dsh-popup-motion="true"') && popup.includes('backdrop-filter:none!important'))
check('毛玻璃有淡回过渡', popup.includes('transition:backdrop-filter .16s linear'))
// 右栏"容器闪出来"的根因：插件把面板推到屏外却没有给 transform 过渡 → 打开时容器瞬移到位。
check('右栏容器自己有 transform 过渡', popup.includes('transition:transform .22s'))
check('内容跟随容器、不再二次位移', popup.includes('[data-dockkit-host="dock"]') && popup.includes('transform:none!important'))
check('右栏容器过渡有首帧闸门', popup.includes('[data-dsh-popup-anim="false"]') && popup.includes('transition:none!important'))
check('instant 切换（fullscreen→push）不播容器过渡', popup.includes('[data-rightbar-instant]'))
check('闸门会被首次展开放行', source.includes('openPopupAnimGate') && observer.includes('openPopupAnimGate()'))
check('右栏内容延迟入场（容器先动、内容后入）', popup.includes('dsh-appearance-popup-in') && /animation:dsh-appearance-popup-in \.16s linear \.\d+s/.test(popup))
check('尊重 reduced-motion', popup.includes('prefers-reduced-motion:reduce') && popup.includes('animation:none'))
check('弹窗样式仍在独立样式表', source.includes('popupTag.textContent = POPUP_STYLE') && source.includes("NS + ':popup'"))

// —— 3. 主面板卡片（插件页 / 自动化任务页）——
const page = templateOf('const PAGE_STYLE =')
check('主面板卡片复用会话区玻璃变量', page.includes('background:var(--dsh-conv-bg)!important') && page.includes('backdrop-filter:blur(var(--dsh-conv-blur))!important'))
check('主面板卡片几何与会话卡片一致（宽度/圆角/外边距）', page.includes('--dsh-conversation-width,760px') && page.includes('border-radius:20px!important') && page.includes('margin:24px auto!important'))
check('插件页自身滚动 → 卡片保留 auto', page.includes('overflow:auto!important'))
check('任务页滚动在内层 → 卡片用 hidden', page.includes('[data-testid="task-manager-page"]{overflow:hidden!important}'))
check('打标走 main 槽锚点的子元素', source.includes('[data-slot="main"]') && source.includes('anchor.children'))
check('会话页不会被误打标', source.includes("el.querySelector('[data-phase]') !== null") && source.includes("el.querySelector('[data-conversation-scroll]') !== null"))
check('主面板卡片有开关且默认开', source.includes('pageCard: true') && source.includes("'pageCard'"))
check('卸载会清掉打标与样式表', source.includes("querySelectorAll('[data-dsh-appearance-page]')") && source.includes("NS + ':page'"))

// —— 4. 既有硬约定不回归 ——
const mainStyle = templateOf('const STYLE =')
check('主样式表长度合理（没有整块回流/死 CSS 复活）', mainStyle.length > 4000 && mainStyle.length < 16000, `实际 ${mainStyle.length} 字节`)
check('弹窗不写 width（避免面板内容逐帧重排）', !popup.includes('width:calc('))
check('拖拽期间不写行内 !important 的列宽', source.includes('dragging ? \'\' : \'important\''))

// —— 4. 括号平衡（曾经被未闭合 @media 吞掉整批规则） ——
check('主样式表大括号平衡', mainStyle.length > 0 && (mainStyle.split('{').length === mainStyle.split('}').length), `{=${mainStyle.split('{').length - 1} }=${mainStyle.split('}').length - 1}`)


// —— 5. 串流热路径（"越用越卡"）：不得每帧做全文档扫描 / 强制布局 ——
const moNew = slice('const mo = new MutationObserver((records) => {', 'mo.observe(document.body')
check('mutation 流不再无条件全量同步', moNew.includes('scheduleFullSync()') && !/^\s*scheduleSync\(\)\s*$/m.test(moNew))
check('结构变化才立刻全量同步', moNew.includes('hasStructuralAddition(records)'))
check('全量同步去抖', /const FULL_SYNC_DEBOUNCE_MS = \d+/.test(source) && source.includes('setTimeout(() => { fullSyncTimer = null'))

const light = slice('const scheduleLightSync = () => {', '// 右栏（文档预览）')
check('轻活只跟随最新，不跑 applyBackground/tagDom', light.includes('scheduleConversationScroll()') && !light.includes('applyBackground') && !light.includes('tagDom'))

const scroller = slice('const scrollConversationToLatest = (force = false) => {', 'const scheduleConversationScroll')
check('跟随最新不再每帧量容器尺寸', !scroller.includes('scroll.offsetWidth') && !scroller.includes('scroll.clientWidth'))
check('滚动容器样式只在切换滚动容器时写', (scroller.match(/setProperty\('overflow-y'/g) || []).length === 1)

const measure = slice('const measureLatestButton = (scroll) => {', 'const scrollConversationToLatest')
check('气泡按钮位置缓存后才写', measure.includes('latestMetrics.right') && measure.includes('measureLatestButton'))
check('窗口 resize 触发一次全量同步', source.includes("addEventListener('resize', onWindowResize)"))

const tooltipSync = slice('const involvesTooltip = (records) => {', 'observer.observe(document.body')
check('tooltip 观察者按批次过滤（不再每次全文档扫描）', tooltipSync.includes("getAttribute('role') === 'tooltip'") && !tooltipSync.includes('new MutationObserver(schedule)'))

const parallax = slice('let lastParallax =', "document.addEventListener('mousemove', move)")
check('视差走合成器 transform 且值不变不写', parallax.includes('translate3d(') && parallax.includes('if (next === lastParallax) return'))
check('壁纸层常驻合成层', mainStyle.includes('will-change:transform'))

check('新增定时器/rAF 在卸载时清理', source.includes('if (fullSyncTimer !== null) { clearTimeout(fullSyncTimer); fullSyncTimer = null }') && source.includes('if (lightSyncFrame !== 0) { cancelAnimationFrame(lightSyncFrame); lightSyncFrame = 0 }'))


// —— 6. 设置页：壁纸文件夹按钮 + 中文名 + 控件美化 ——
const panel = slice('function Panel() {', 'function apply(ctx) {')
check('设置页不再有文件选择框', !panel.includes("type: 'file'"))
check('设置页不再显示存储路径', !panel.includes('wallpaperDir') && !panel.includes('存储位置'))
check('壁纸文件夹按钮调用宿主路由', panel.includes("fetch('/bg/reveal', { method: 'POST' })"))
check('按钮有禁用态与提示文案', panel.includes('正在打开…') && panel.includes('dsh-appearance-notice'))
check('壁纸名字解码后再显示', panel.includes('decodeURIComponent') && panel.includes('item?.name') && panel.includes('name }'))
check('选中但已不在文件夹里的壁纸仍可显示', panel.includes('已不在文件夹中'))
check('壁纸下拉框用解码名作 option 文本', /files\.map\(\(f\) => h\('option', \{ key: f\.url, value: f\.url \}, f\.name\)\)/.test(panel))
for (const cls of ['dsh-appearance-switch', 'dsh-appearance-select', 'dsh-appearance-range', 'dsh-appearance-color', 'dsh-appearance-btn']) {
  check('美化的控件有样式：' + cls, mainStyle.includes('.' + cls) && panel.includes(cls))
}
check('按钮有 hover / focus-visible / disabled 态', mainStyle.includes('.dsh-appearance-btn:hover') && mainStyle.includes('.dsh-appearance-btn:focus-visible') && mainStyle.includes('.dsh-appearance-btn:disabled'))
check('下拉框自绘箭头（不依赖原生外观）', mainStyle.includes('.dsh-appearance-select::after') && mainStyle.includes('-webkit-appearance:none'))
check('开关用 input+label 结构保持可访问性', /h\('label', \{ className: 'dsh-appearance-switch' \}, h\('input', \{ type: 'checkbox'/.test(panel))


// —— 7. 随包默认壁纸 ——
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"))
const hostSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "host", "index.js"), "utf8")
check("包内清单带两张默认壁纸", pkg.files.filter((f) => f.includes("花与大肥鱼")).length === 2)
check("默认壁纸是 version2", hostSrc.includes("DEFAULT_WALLPAPER") && hostSrc.includes("version2.png"))
check("客户端默认值与宿主一致", source.includes("DEFAULT_WALLPAPER") && source.includes("bgImage: DEFAULT_WALLPAPER"))
check("宿主把包内目录作为只读壁纸源", hostSrc.includes("packageAssets") && hostSrc.includes("import.meta.url"))
check("用户目录优先于包内默认", /assetDirs = \[\.\.\.new Set\(\[dir,/.test(hostSrc))


// —— 8. 宿主与客户端的 defaults 必须逐键一致（默认外观由真机配置固化而来） ——
const defaultsOf = (text, marker) => {
  const at = text.indexOf(marker)
  if (at < 0) return null
  const start = text.indexOf("{", at)
  let depth = 0
  let end = -1
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++
    else if (text[i] === "}") { depth--; if (depth === 0) { end = i; break } }
  }
  if (end < 0) return null
  const body = text.slice(start + 1, end)
  const out = {}
  // 一个 default 对象里可能一行放多个键，所以按逗号切分（值都是简单字面量，不含逗号）。
  for (const entry of body.split(",")) {
    const m = /^\s*([A-Za-z]+)\s*:\s*(.+?)\s*$/.exec(entry)
    if (!m) continue
    out[m[1]] = m[2]
  }
  return out
}
const hostDefaults = defaultsOf(hostSrc, "const defaults = {")
const clientDefaults = defaultsOf(source, "const defaults = {")
check("能解析出两份 defaults", hostDefaults !== null && clientDefaults !== null)
if (hostDefaults && clientDefaults) {
  const hostKeys = Object.keys(hostDefaults).sort()
  const clientKeys = Object.keys(clientDefaults).sort()
  check("键集合一致", JSON.stringify(hostKeys) === JSON.stringify(clientKeys), "host=" + hostKeys.length + " client=" + clientKeys.length)
  const diffs = hostKeys.filter((k) => hostDefaults[k] !== clientDefaults[k])
  check("每个键的默认值一致", diffs.length === 0, diffs.join(", "))
  const expected = {
    bgOpacity: "1", bgMask: "'#f8f7f7'", bgMaskOpacity: "0",
    conversationOpacity: "0.2", conversationBlur: "2", conversationWidth: "870",
    chatBoxOpacity: "0.59", chatBoxRadius: "24",
    settingsOpacity: "0.4", sidebarOpacity: "0.4", previewPopupInset: "8",
  }
  const wrong = Object.entries(expected).filter(([k, v]) => hostDefaults[k] !== v)
  check("固化的默认外观是当前调好的那套", wrong.length === 0, wrong.map(([k]) => k + "=" + hostDefaults[k]).join(", "))
  check("默认壁纸在两份 defaults 里都是 version2", hostDefaults.bgImage.includes("DEFAULT_WALLPAPER") && clientDefaults.bgImage.includes("DEFAULT_WALLPAPER"))
}

// 2026-11-23 反馈：「+」点开后菜单看不见。原因是输入框上的 contain:paint 会裁剪
// 子元素并新建层叠上下文，把弹出的菜单压到会话滚动层下面（paint containment
// 无法用 overflow:visible 覆盖）。这里静态盯住，别再写回去。
{
  const style = templateOf("const STYLE =")
  check("输入框不用 contain:paint（会裁掉弹出菜单）", !/\[data-dsh-appearance-composer\][^}]*contain:paint/.test(style))
  check("会话卡片也不用 contain:paint", !/\[data-phase="active"\][^}]*contain:paint/.test(style))
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
