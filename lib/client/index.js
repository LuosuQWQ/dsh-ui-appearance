window.__ModuleLoader__.load({ id: 'dsh-ui-appearance', factory: (require) => {
  const module = { exports: {} }
  const React = require('react')
  const h = React.createElement
  const NS = 'dsh-ui-appearance'
  const STORE_KEY = 'dsh-ui-appearance:settings'
  // 与宿主保持同一个默认值：没配置过的用户开箱就有壁纸；显式选过「不使用壁纸」的用户存的是空串，不受影响。
  const DEFAULT_WALLPAPER = '/bg/' + encodeURIComponent('花与大肥鱼 version2.png')
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
  const rgba = (color, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(color || ''); if (!m) return color; const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})` }
  const borderValue = (v) => v === 'thick' ? '2px solid rgba(120,130,145,.35)' : v === 'thin' ? '1px solid rgba(120,130,145,.24)' : 'none'
  const load = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY)) || {}
      const merged = { ...defaults, ...raw }
      if (!merged.v || merged.v < 2) {
        merged.chatBoxBorder = 'none'; merged.chatBoxBlur = 0
        merged.v = 2
        try { localStorage.setItem(STORE_KEY, JSON.stringify(merged)) } catch {}
      }
      return merged
    } catch { return { ...defaults } }
  }
  let current = load()
  const preloadBackground = (settings) => {
    if (typeof document === 'undefined') return null
    // Once the real wallpaper layer (.dsh-appearance-bg) exists, do NOT keep a
    // second always-100%-opaque wallpaper on <html>: it would duplicate the image
    // and show through (instead of a plain base) when wallpaper transparency drops.
    if (document.querySelector('.dsh-appearance-bg')) return null
    const old = document.getElementById('dsh-ui-appearance-preload')
    old?.remove()
    const tag = document.createElement('style')
    tag.id = 'dsh-ui-appearance-preload'
    const image = settings?.bgImage ? `url("${String(settings.bgImage).replace(/"/g, '\\"')}")` : 'none'
    tag.textContent = `html,body{background-color:transparent!important}html{background-image:${image}!important;background-size:${settings?.bgSize === 'contain' ? 'contain' : 'cover'}!important;background-repeat:no-repeat!important;background-position:center!important}#root{background:transparent!important}`
    document.head.appendChild(tag)
    if (!settings?.bgImage) tag.remove()
    return tag
  }
  preloadBackground(current)
  if (typeof document !== 'undefined') {
    fetch('/bg/config').then((response) => response.ok ? response.json() : null).then((config) => {
      if (!config || !config.bgImage) return
      current = { ...defaults, ...config }
      try { localStorage.setItem(STORE_KEY, JSON.stringify(current)) } catch {}
      preloadBackground(current)
    }).catch(() => {})
  }
  let persistTimer
  let stateRevision = 0
  const persistRemote = (s) => fetch('/bg/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) }).catch(() => {})
  const persist = (s) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch {}
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => { void persistRemote(s) }, 120)
  }
  const hydrate = async () => {
    const revision = stateRevision
    let remote = null
    let backgrounds = null
    try {
      const response = await fetch('/bg/config')
      if (response.ok) remote = await response.json()
    } catch {}
    try {
      const response = await fetch('/bg/list')
      if (response.ok) backgrounds = await response.json()
    } catch {}
    if (revision !== stateRevision) return current
    const hasRemoteConfig = remote && typeof remote === 'object' && (remote.bgImage || Number(remote.v) >= 2)
    const next = { ...defaults, ...current, ...(hasRemoteConfig ? remote : {}) }
         if (Array.isArray(backgrounds) && next.bgImage && !backgrounds.includes(next.bgImage)) {
       
       next.bgImage = ''
        
     }
    current = next
    try { localStorage.setItem(STORE_KEY, JSON.stringify(current)) } catch {}
    if (!hasRemoteConfig) void persistRemote(current)
    return current
  }
  let instantSidebarExpand = false
  let sidebarWideWidth = 280
  let sidebarPointerHandledAt = 0
  let rightbarTrackPx = 0
  let sidebarRevealed = false
  let sidebarPinTimer = null
  /* —— 动效预算（motion budget）——
     「首次滑入卡顿」的成因主要不在 CSS，而在动画窗口里还在做重活：
       · 挂载时会连跑两遍 applyBackground（几十个 CSS 变量 + theme token + 全量查询）；
       · 每次 mousemove 都对侧栏 root 量一次 getBoundingClientRect（紧跟在一批 inline
         样式写入之后 → 强制同步布局）；
       · 右栏（文档预览）展开时，centerCol 的 ResizeObserver 每帧回调一次，而它调的是
         全量 applyBackground。
     这三件事在第一次发生时代价最大（样式/布局/字体缓存都是冷的），正好压在滑入动画的
     前几帧上，于是"第一次特别卡、之后越来越顺"。下面的窗口只做一件事：动画期间不跑重活，
     结束后补一次合并同步；几何同步照旧每帧做（它便宜）。 */
  let motionUntil = 0
  let motionTimer = null
  const motionActive = () => (typeof performance !== 'undefined' ? performance.now() : 0) < motionUntil
  const enterMotion = (ms) => {
    const now = typeof performance !== 'undefined' ? performance.now() : 0
    const until = now + ms
    if (until > motionUntil) motionUntil = until
    if (motionTimer !== null) clearTimeout(motionTimer)
    // 计时器按"当前窗口真正结束的时刻"重排：短窗口（hover 260ms）不能截断长窗口（右栏 420ms）。
    const remaining = Math.max(0, motionUntil - now)
    motionTimer = setTimeout(() => { motionTimer = null; motionUntil = 0; flushAfterMotion?.() }, remaining + 48)
  }
  // 由 shell effect 注入：把动画期间被推迟的合并同步补上。
  let flushAfterMotion = null
  // 侧栏几何是否已经初始化过（首帧直接归位，不做过渡）。
  let sidebarGeometryReady = false
  // 侧栏内容是否已经在屏幕内被光栅化过一次（首次展开的过渡只会在冷启动时掉帧）。
  let sidebarWarmed = false
  // 侧栏"瞬时定位"的令牌：每次瞬时写样式 +1，延迟还回过渡时对比，避免旧回调覆盖新状态。
  let sidebarInstantToken = 0
  // 首次展开前的静默预热（见 README §3.6）。为什么需要它：自动隐藏的侧栏是靠
  // margin-left 移出视口的，屏幕外的内容不会被光栅化，所以"第一次滑入"其实是
  // 这笔栅格化/字形缓存第一次被付账，代价正好落在过渡的头两帧上。
  // 预热做法：趁用户还没动它，把侧栏在屏幕内画一帧（opacity≈0，肉眼不可见）再收回去。
  const prewarmSidebar = () => {
    if (sidebarWarmed || !current.sidebarAutoHide || current.prewarmFirstSlide === false) return false
    const sidebar = document.querySelector('[class*="sidebarCol"]')
    const root = sidebar && sidebar.querySelector('[data-slot="sidebar"] > [class*="root"]')
    if (!root || !root.isConnected) return false
    if (sidebar.getAttribute('data-dsh-sidebar-revealed') !== 'false') return false
    if (root.querySelector('[role="dialog"]')) return false
    const width = sidebarWideWidth > 50 ? Math.round(sidebarWideWidth) : 280
    root.style.setProperty('transition', 'none', 'important')
    root.style.setProperty('margin-left', '0px', 'important')
    root.style.setProperty('opacity', '0.002', 'important')
    root.style.setProperty('pointer-events', 'none', 'important')
    sidebarWarmed = true
    const restore = () => {
      if (!root.isConnected) return
      root.style.setProperty('margin-left', '-' + width + 'px', 'important')
      requestAnimationFrame(() => {
        if (!root.isConnected) return
        root.style.setProperty('transition', 'margin-left .22s var(--ds-ease-in-out)', 'important')
        root.style.removeProperty('pointer-events')
      })
    }
    let restored = false
    const finish = () => {
      if (restored || !root.isConnected) return
      restored = true
      root.style.removeProperty('opacity')
      root.style.removeProperty('pointer-events')
      if (sidebar.getAttribute('data-dsh-sidebar-revealed') !== 'false') {
        // 预热期间用户已经在往左边缘移动了：把这帧直接当作展开态，别收回去。
        root.style.setProperty('transition', 'margin-left .22s var(--ds-ease-in-out)', 'important')
        return
      }
      restore()
    }
    requestAnimationFrame(() => requestAnimationFrame(finish))
    // 后台标签页里 rAF 不跑：兜底 400ms 后强制收回去，避免侧栏停在"不可见但占位"的状态。
    setTimeout(finish, 400)
    return true
  }
    const sidebarStyleState = new WeakMap()
    const sidebarStyleElements = new Set()
    const sidebarRootStyleState = new WeakMap()
    const sidebarRootStyleElements = new Set()
    const frameStyleState = new WeakMap()
    const rememberStyle = (map, el, properties) => {
      if (map.has(el)) return map.get(el)
      const state = Object.fromEntries(properties.map((name) => [name, [el.style.getPropertyValue(name), el.style.getPropertyPriority(name)]]))
      map.set(el, state)
      return state
    }
    const restoreStyleProperties = (map, el, properties) => {
      const state = map.get(el)
      if (!state) return
      properties.forEach((name) => {
        const entry = state[name]
        if (!entry) return
        const [value, priority] = entry
        if (value) el.style.setProperty(name, value, priority)
        else el.style.removeProperty(name)
      })
    }
    const restoreStyle = (map, el) => {
      const state = map.get(el)
      if (!state) return
      Object.entries(state).forEach(([name, [value, priority]]) => value ? el.style.setProperty(name, value, priority) : el.style.removeProperty(name))
      map.delete(el)
    }
    /* DSH 0.2.0 把官方的"收起侧边栏"按钮改成了 caption 里的固定按钮：Windows 下
       `[data-windows-titlebar] ._toggle{position:fixed;left:12px;top:calc((标题栏高-28px)/2);z-index:30}`，
       而 macOS 下整个侧栏收起时改由框架 `shell.leading` 座里的 HeaderLeadingControls 提供
       （没有 `toggle` 类名，也不在 `sidebarCol` 内）。0.1.5 完全没有这套。
       关键点：这个按钮仍然是本节点（侧栏 root）的后代。只要 root 上有非 `none` 的 transform
       （哪怕只是 `translateX(0)`）或 `will-change:transform`，root 就会成为 fixed 后代的
       包含块——按钮会改以 root（在标题栏下方）为原点定位，并且跟着侧栏一起被拖出屏幕。
       所以这里改用 `margin-left` 位移：隐藏时把 root 推到视口左侧外（列本身已被插件设成
       width:0 / overflow:visible，隐藏靠移出视口、显示靠溢出可见），效果与原来的
       translateX(-100%) 一致，但不产生包含块，官方按钮就始终以视口为参照。 */
    // instant=true 用于两种情况（见 README §3.6）：
    //   · 挂载后的第一次定位：侧栏要立刻停在自己的位置上，不能从 0 滑过去；
    //   · 首次从屏幕外展开：此刻侧栏内容才第一次被光栅化，过渡只会把这笔开销摊成掉帧，
    //     不如直接显示（之后所有展开都正常走 .22s 过渡）。
    const syncSidebarRoot = (sidebar, autoHide, instant) => {
      const root = sidebar?.querySelector('[data-slot="sidebar"] > [class*="root"]')
      if (!root) return
      if (!sidebarRootStyleElements.has(root)) {
        sidebarRootStyleElements.add(root)
        sidebarRootStyleState.set(root, { marginLeft: [root.style.getPropertyValue('margin-left'), root.style.getPropertyPriority('margin-left')], transform: [root.style.getPropertyValue('transform'), root.style.getPropertyPriority('transform')], willChange: [root.style.getPropertyValue('will-change'), root.style.getPropertyPriority('will-change')], transition: [root.style.getPropertyValue('transition'), root.style.getPropertyPriority('transition')] })
      }
      const revealed = sidebar.getAttribute('data-dsh-sidebar-revealed') !== 'false'
      const hasDialog = !!root.querySelector('[role="dialog"]')
      // 隐藏偏移必须用**真实宽度**，缓存只能兜底。缓存会被写小/写旧：
      //   · 标题栏的收起按钮在官方窄栏（56px）姿态下被点到（旧代码拿 >0 就写缓存）；
      //   · 拖分界线 / 切会话时量到过渡中的中间值；
      //   · 自动隐藏期间 syncFrameColumns 不再读官方轨道（autoHide 时它把左轨当 0），
      //     缓存从此不会被刷新，和真实宽度越走越远。
      // 一旦缓存小于真实宽度，收起就只把侧栏推出去那么远 —— 表现就是左边永远留一条缝、
      // 或半截侧栏露在屏幕外，而且随"上次量到的是哪个姿态"随机复现。
      // 代价只有一次 getBoundingClientRect，并且放在下面这批 inline 写入之前（不额外制造回流）；
      // 只在自动隐藏时测量：展开态根本不用宽度。
      const measuredWidth = autoHide ? Math.round(root.getBoundingClientRect().width) : 0
      if (measuredWidth > 200) sidebarWideWidth = measuredWidth
      // 取两者较大值：欠移会露出侧栏（可见的 bug），过移只是把空无一物的侧栏多推出去一点，
      // 视觉上无差别；展开动画的距离变大也不影响观感（时长固定 .22s）。
      const sidebarWidth = Math.max(
        measuredWidth > 50 ? measuredWidth : 0,
        Math.round(sidebarWideWidth) || 0,
      ) || 280
      // 把可能存在的 transform/will-change 清干净：任何一处都会让官方 fixed 按钮改换包含块。
      root.style.setProperty('transform', 'none', 'important')
      root.style.removeProperty('will-change')
      // 预热用的临时 opacity 必须在这里兜底清掉：任何一次同步都要保证侧栏是可见的。
      if (root.style.getPropertyValue('opacity')) root.style.removeProperty('opacity')
      const hidden = !!autoHide && !revealed && !hasDialog
      const firstReveal = !!autoHide && !hidden && !sidebarWarmed && current.prewarmFirstSlide !== false
      const instantNow = instant === true || !sidebarGeometryReady || firstReveal
      if (instantNow) root.style.setProperty('transition', 'none', 'important')
      else root.style.setProperty('transition', 'margin-left .22s var(--ds-ease-in-out)', 'important')
      if (hidden) root.style.setProperty('margin-left', '-' + sidebarWidth + 'px', 'important')
      else root.style.setProperty('margin-left', '0px', 'important')
      sidebarGeometryReady = true
      if (!hidden) sidebarWarmed = true
      if (instantNow && !hasDialog) {
        // 两帧后再把过渡还回去，确保浏览器已经用 transition:none 提交了这一帧。
        // 用递增令牌防止"这两帧里又发生了一次同步"时被旧回调覆盖。
        sidebarInstantToken += 1
        const token = sidebarInstantToken
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (token !== sidebarInstantToken || !root.isConnected) return
          root.style.setProperty('transition', 'margin-left .22s var(--ds-ease-in-out)', 'important')
        }))
      }
      if (hasDialog) {
        if (autoHide) sidebar.setAttribute('data-dsh-sidebar-revealed', 'true')
        root.style.setProperty('margin-left', '0px', 'important')
        root.style.setProperty('transition', 'none', 'important')
        root.style.setProperty('contain', 'none', 'important')
        sidebar.style.setProperty('z-index', autoHide ? '30' : '60', 'important')
      } else if (!autoHide) {
        sidebar.style.removeProperty('z-index')
      }
    }

  // applyBackground 的"几何半"：只动侧栏列和 root。点击收起、Hover 展开、动画结束后的
  // 补同步都走这里，避免为了一个布尔开关重跑 applyBackground（它会重写几十个 CSS 变量、
  // 主题 token 和壁纸样式——第一次跑时这些写入会把整页样式重算一遍）。
  const applySidebarColumns = (s) => {
    const autoHide = !!s.sidebarAutoHide
    document.querySelectorAll('[class*="sidebarCol"]').forEach((sidebar) => {
      rememberStyle(sidebarStyleState, sidebar, ['background', 'position', 'width', 'min-width', 'height', 'overflow', 'z-index'])
      sidebar.setAttribute('data-dsh-auto-hide', String(autoHide))
      if (autoHide) {
        sidebar.setAttribute('data-dsh-sidebar-revealed', String(sidebarRevealed))
        sidebar.style.setProperty('position', 'relative', 'important')
        sidebar.style.setProperty('width', '0', 'important')
        sidebar.style.setProperty('min-width', '0', 'important')
        sidebar.style.setProperty('height', '100%', 'important')
        sidebar.style.setProperty('overflow', 'visible', 'important')
        sidebar.style.setProperty('z-index', '30', 'important')
      } else {
        sidebar.setAttribute('data-dsh-sidebar-revealed', 'true')
        restoreStyleProperties(sidebarStyleState, sidebar, ['position', 'width', 'min-width', 'height', 'overflow', 'z-index'])
      }
      syncSidebarRoot(sidebar, autoHide)
    })
  }

  // 给"非会话"的主面板根节点打标（供 PAGE_STYLE 使用）。判据：`.centerCol` 的直接子元素里，
  // 自身或子树带 [data-phase] / [data-conversation-scroll] 的是会话页；其余都是页面
  // （插件、自动化任务，以及以后新增的 main 面板）。不依赖 hashed 类名、不读 layout store。
  const tagMainPanels = () => {
    const keep = new Set()
    // 官方的 main 槽是 `div[data-slot="main"]{display:contents}` 锚点，真正的面板是它的子元素
    // （插件页 = section[data-plugin-panel]，任务页 = section[data-testid="task-manager-page"]）。
    // 锚点找不到时退回 `.centerCol` 的直接子元素，兼容布局略有差异的版本。
    const anchor = document.querySelector('[class*="centerCol"] [data-slot="main"]') || document.querySelector('[class*="centerCol"]')
    // 会话区自己的卡片由 STYLE 负责；「不启用区分」时两张卡片一起消失。
    const enabled = current.pageCard !== false && current.conversationEnabled !== false
    if (enabled && anchor !== null) {
      for (const el of Array.from(anchor.children)) {
        if (el.hasAttribute('data-phase') || el.querySelector('[data-phase]') !== null) continue
        if (el.querySelector('[data-conversation-scroll]') !== null) continue
        if (el.querySelector('[data-composer-seat]') !== null) continue
        keep.add(el)
        el.setAttribute('data-dsh-appearance-page', '')
      }
    }
    document.querySelectorAll('[data-dsh-appearance-page]').forEach((el) => { if (!keep.has(el)) el.removeAttribute('data-dsh-appearance-page') })
  }

  // DSH 0.1.5 的 frame 是"侧边栏 | 会话 | 右侧栏"三轨，右侧栏承载文档预览弹窗。
  // 本插件必须自己写 grid-template-columns（固定侧边栏宽度、侧边栏自动隐藏），但第三轨
  // 不能再写死 0：那会让弹窗浮在会话区之上、会话区也不跟着收窄（"慢半拍"）。
  // 判断依据以"弹窗自己是否展开"（data-sidebar-right-open）为准，而不是只看 frame 上的
  // data-rightbar-collapsed——后者只说明官方这一帧没给轨道（覆盖式弹窗），弹窗可能照样开着。
  // DSH 0.2.0 的官方轨道换成了 `Npx minmax(0|400px, 1fr) minmax(0px, Mpx)`：第三轨不再是
  // 裸的 `Npx`（右栏有轨道时中间轨还有 400px 最小值），旧正则因此永不匹配，插件会把右轨一直
  // 钉在 0、弹窗退化成覆盖式浮层。这里两种写法都接受，并读出官方给的第三轨上限。
  const FRAME_COLUMNS_RE = /^\s*[\d.]+px\s+minmax\(\s*(?:0(?:px)?|[\d.]+px)\s*,\s*1fr\s*\)\s+(?:minmax\(\s*0px?\s*,\s*([\d.]+)px\s*\)|([\d.]+)px)\s*$/
  const MIN_CENTER_PX = 300
  // 0.2.0 官方 grid 在右栏占轨道时给中间列的下限（见 AppFrame 的 gridTemplateColumns）。
  const HOST_CENTER_MIN_PX = 400
  // 官方 inline 轨道的**第一轨**（左列宽度）。拖动左侧分界线时，官方每次 pointermove 都会把
  // 新宽度写进同一条 inline `grid-template-columns`；而插件又必须自己重写整条轨道。不读这个值
  // 就等于每次都拿缓存宽度把用户拖出来的宽度按回去 —— 表现就是"左分界线拖不动 / 一松手就弹回"。
  const FRAME_SIDEBAR_TRACK_RE = /^\s*([\d.]+)px\s+/
  const frameSidebarTrackPx = (raw) => { const m = FRAME_SIDEBAR_TRACK_RE.exec(raw || ''); return m ? Math.round(parseFloat(m[1])) : 0 }
  const syncFrameColumns = (frameRoot, autoHide, wideW, instant) => {
    const raw = frameRoot.style.getPropertyValue('grid-template-columns')
    const priority = frameRoot.style.getPropertyPriority('grid-template-columns')
    // 右栏是按会话的：切换会话时旧会话的 SessionView 只是被 hidden，旧面板仍
    // 带着 data-sidebar-right-open。querySelector 若先命中这个隐藏面板，右栏明明
    // 已收起却仍给第三轨留宽，表现就是「侧栏消失、主栏不回撤」。只认可见面板。
    const panel = Array.from(document.querySelectorAll('[data-sidebar-right-panel]')).find((el) => el.closest('[hidden]') === null) || null
    const panelOpen = panel !== null && panel.hasAttribute('data-sidebar-right-open')
    // DSH 0.2.0 的右栏面板不再写行内 `width`：它把自己的宽度发布成 `--dsh-sidebar-width`，
    // 官方没给轨道时用这个值兜底（行内没有就退回计算值，兼容它挂在别的节点上的情况）。
    const panelInline = panel === null ? '' : panel.style.width
    const panelVarInline = panel === null ? '' : panel.style.getPropertyValue('--dsh-sidebar-width')
    const panelTrack = /^[\d.]+px$/.test(panelInline) ? panelInline
      : /^[\d.]+px$/.test(panelVarInline) ? panelVarInline
        : panel === null ? '' : getComputedStyle(panel).getPropertyValue('--dsh-sidebar-width').trim()
    const panelPx = /^[\d.]+px$/.test(panelTrack) ? Math.round(parseFloat(panelTrack)) : 0
    let track = 0
    if (panelOpen) {
      const native = priority === 'important' || raw === '' ? null : FRAME_COLUMNS_RE.exec(raw)
      if (native !== null) track = Math.max(0, Math.round(parseFloat(native[1] !== undefined ? native[1] : native[2])))
      else if (panelPx > 0) track = panelPx
      if (frameRoot.getAttribute('data-rightbar-collapsed') !== null && panelPx > 0) {
        // 官方这一帧把右轨收成 0（覆盖式弹窗），但弹窗确实开着：只要会话列还放得下，
        // 就替弹窗让出一条轨道，并保证会话列至少留 MIN_CENTER_PX；放不下才回退到官方覆盖式。
        const sidebarTrack = autoHide ? 0 : wideW
        const room = frameRoot.getBoundingClientRect().width - sidebarTrack - MIN_CENTER_PX
        const wanted = Math.min(panelPx, Math.max(0, room))
        track = wanted >= MIN_CENTER_PX ? wanted : 0
      }
    }
    rightbarTrackPx = Math.max(0, track)
    // 左轨宽度以官方 inline 第一轨为准（拖动分界线时它是唯一"当前值"），读不到才退回缓存。
    // 注意 56px 是官方的窄栏(rail)宽度，只有明显是展开宽度时才更新缓存——缓存同时被
    // 自动隐藏的负偏移使用，被窄栏覆盖会让侧栏只滑出 56px、剩下一截还留在屏幕里。
    const nativeSidebarPx = autoHide ? 0 : frameSidebarTrackPx(raw)
    if (nativeSidebarPx > 200) sidebarWideWidth = nativeSidebarPx
    const sidebarTrack = autoHide ? '0' : `${nativeSidebarPx > 0 ? nativeSidebarPx : wideW}px`
    // 官方拖拽分界线/即时切换期间（[data-dragging] / [data-rightbar-instant]）由官方自己接管网格：
    // 官方样式表里这两条会把 transition 关掉，好让列宽 1:1 跟手；但本插件之前用行内 !important
    // 写 transition，优先级压过了它们，于是拖拽期间列宽仍在走 .22s 缓动、指针追不上。这里拖拽
    // 期间不写 !important、并把插件写的过渡整个删掉，交还给官方。
    const dragging = frameRoot.hasAttribute('data-dragging') || frameRoot.hasAttribute('data-rightbar-instant')
    // 中间列的最小宽度对齐 0.2.0 官方写法 `${cols.rightbar === 0 ? 0 : 400}px`：右栏没占轨道时
    // 允许会话列被压到 0，右栏占轨道时保留 400px 下限（否则插件会把官方的 400px 下限抹掉）。
    const centerMin = rightbarTrackPx > 0 ? HOST_CENTER_MIN_PX : 0
    frameRoot.style.setProperty('grid-template-columns', `${sidebarTrack} minmax(${centerMin}px,1fr) ${rightbarTrackPx}px`, dragging ? '' : 'important')
    if (dragging) frameRoot.style.removeProperty('transition')
    else frameRoot.style.setProperty('transition', instant ? 'none' : 'grid-template-columns .22s var(--ds-ease-in-out)', 'important')
    document.documentElement.style.setProperty('--dsh-rightbar-track', `${rightbarTrackPx}px`)
  }
  // DSH 0.1.5 的右侧文档预览（"弹窗预览"）与会话区共享同一层玻璃：底色/透明度、毛玻璃强度
  // 直接取自 --dsh-conv-bg / --dsh-conv-blur，圆角与会话卡片一致（20px），不另开一套参数。
  // 宽度故意不写：面板保持官方给它的 inline px 宽，鼠标每动一次它才变一次；一旦写成
  // calc(100% - …) 就等于让面板宽度跟着被动画的网格轨道逐帧变化，预览里几千行代码会整篇
  // 反复重排（拖动分界线卡顿的元凶之一）。
  // 注意：这段必须单独放进自己的 <style>。STYLE 末尾的 `@media(max-width:640px){` 历史上就没
  // 闭合（补上它会唤醒一批 0.1.2 时代的旧规则，反而破坏 0.1.5 的会话区滚动/排版），而挂在那个
  // 标签后面会让本规则被解析成嵌套规则、永远不匹配——所以它不能复用主样式标签。
  // 玻璃部分对所有形态生效（"push" 与点「全屏」后的 "fullscreen" 都是同一个 [data-sidebar-right-panel]，
  // 全屏时官方背景同样是被主题 token 抹成透明的，必须一起补上）；几何部分只针对 push。
  const POPUP_STYLE = `html[data-dsh-popup-sync="true"] [data-sidebar-right-panel]{background:var(--dsh-conv-bg)!important;backdrop-filter:blur(var(--dsh-conv-blur));-webkit-backdrop-filter:blur(var(--dsh-conv-blur));transition:backdrop-filter .16s linear}html[data-dsh-popup-sync="true"] [data-sidebar-right-panel="push"]{top:var(--dsh-popup-inset,12px)!important;bottom:var(--dsh-popup-inset,12px)!important;right:var(--dsh-popup-inset,12px)!important;border:none!important;box-shadow:none!important;border-radius:20px!important;overflow:hidden!important;transition:transform .22s var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1)),backdrop-filter .16s linear}html[data-dsh-popup-sync="true"][data-dsh-popup-anim="false"] [data-sidebar-right-panel="push"],html[data-dsh-popup-sync="true"] [class*="frame"][data-rightbar-instant] [data-sidebar-right-panel="push"]{transition:none!important}html[data-dsh-popup-sync="true"] [data-sidebar-right-panel="push"]:not([data-sidebar-right-open]){transform:translateX(calc(100% + var(--dsh-popup-inset,12px)))!important}html[data-dsh-popup-sync="true"] [data-sidebar-right-panel="push"] [data-dockkit-host="dock"],html[data-dsh-popup-sync="true"] [data-sidebar-right-panel="push"] [data-dockkit-empty],html[data-dsh-popup-sync="true"] [data-sidebar-right-panel="push"] [data-dockkit-divider]{transform:none!important}html[data-dsh-popup-motion="true"] [data-sidebar-right-panel]{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}html[data-dsh-popup-sync="true"][data-dsh-popup-motion="true"] [data-sidebar-right-panel="push"][data-sidebar-right-open] [data-dockkit-host="dock"]{animation:dsh-appearance-popup-in .16s linear .12s both}@keyframes dsh-appearance-popup-in{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){html[data-dsh-popup-sync="true"] [data-sidebar-right-panel],html[data-dsh-popup-sync="true"] [data-sidebar-right-panel="push"]{transition:none}html[data-dsh-popup-sync="true"][data-dsh-popup-motion="true"] [data-sidebar-right-panel="push"][data-sidebar-right-open] [data-dockkit-host="dock"]{animation:none}}`
  // —— 主面板卡片（插件页 / 自动化任务页 …）——
  // 官方只有会话页自带卡片；其它 main 面板（插件、自动化任务，以及以后新增的）是整列铺满。
  // 这里给它们套一个与会话区**共用同一套变量**的毛玻璃容器：底色/透明度 → --dsh-conv-bg，
  // 毛玻璃强度 → --dsh-conv-blur，宽度 → --dsh-conversation-width，圆角 20px 与会话卡片一致。
  // 只改外观、不接管滚动：卡片自己 `overflow:hidden` 只负责裁圆角，页面内部原有的滚动容器
  // （以及它的 sticky 页头）保持原样。
  // 打标由 tagMainPanels() 完成（`.centerCol` 下非会话的直接子元素），不依赖 hashed 类名，
  // 以后新增主面板自动生效；卸载时属性与样式表一起清掉。
  const PAGE_STYLE = `[class*=centerCol] [data-dsh-appearance-page]{position:relative;width:min(var(--dsh-conversation-width,760px),calc(100% - 48px))!important;max-width:var(--dsh-conversation-width,760px)!important;margin:24px auto!important;height:calc(100% - 48px)!important;max-height:calc(100% - 48px)!important;min-height:0!important;box-sizing:border-box!important;border-radius:20px!important;overflow:auto!important;background:var(--dsh-conv-bg)!important;backdrop-filter:blur(var(--dsh-conv-blur))!important;-webkit-backdrop-filter:blur(var(--dsh-conv-blur))!important}[class*=centerCol] [data-dsh-appearance-page][data-testid="task-manager-page"]{overflow:hidden!important}[class*=centerCol] [data-dsh-appearance-page][data-testid="task-manager-page"] aside[class*="detail"]{background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent)!important}`
  const STYLE = `.dsh-appearance-bg{position:fixed;inset:-80px;z-index:0;pointer-events:none;will-change:transform;background-image:var(--dsh-bg-image);background-size:var(--dsh-bg-size);background-repeat:var(--dsh-bg-repeat);background-position:center;opacity:var(--dsh-bg-opacity);filter:blur(var(--dsh-bg-blur));transition:transform .12s var(--dsh-parallax-easing)}[class*=frame]{position:relative;z-index:2;background:transparent!important}[class*=centerCol],[class*=sidebarCol]{background:transparent!important}[class*=centerCol] [data-phase="hero"],[class*=centerCol] [data-phase="active"]{width:min(var(--dsh-conversation-width,760px),calc(100% - 48px));max-width:var(--dsh-conversation-width,760px);margin:24px auto;min-height:0;border-radius:20px;box-sizing:border-box;overflow:hidden}[class*=centerCol] [data-phase="active"]{height:calc(100% - 48px)!important;max-height:calc(100% - 48px)!important;min-height:0!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;background:var(--dsh-conv-bg)!important;overflow:visible!important;backdrop-filter:blur(var(--dsh-conv-blur));-webkit-backdrop-filter:blur(var(--dsh-conv-blur));will-change:backdrop-filter;contain:layout paint}[class*=centerCol] [data-phase="active"] [data-conversation-scroll]{display:grid!important;grid-template-rows:minmax(0,1fr) auto!important;min-height:0!important;overflow:visible!important}[class*=centerCol] [data-phase="active"] [data-conversation-scroll] [data-dsh-appearance-session]{grid-row:1;display:flex!important;flex-direction:column!important;min-width:0!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important}[class*=centerCol] [data-phase="active"] [data-conversation-scroll] [data-dsh-appearance-seat]{grid-row:2;position:relative!important;z-index:20!important;display:flex!important;flex-direction:column!important;flex:none!important;min-width:0!important;max-width:100%!important;overflow:visible!important}[class*=centerCol] [class*=composerSeat]{width:100%!important;max-width:100%!important;border:none!important;box-shadow:none!important;background:transparent!important}[data-dsh-appearance-composer]{background:var(--dsh-composer-bg)!important;backdrop-filter:blur(var(--dsh-composer-blur));-webkit-backdrop-filter:blur(var(--dsh-composer-blur));will-change:backdrop-filter;contain:layout paint;border:var(--dsh-composer-border)!important;border-radius:var(--dsh-composer-radius)!important;overflow:visible!important}/* DSH 0.2.0：设置面板由 SettingsPanel 用 createPortal(..., document.body) 渲染（0.1.5 是内联在
   sidebar.settings 槽里），所以原来那条 [data-slot='sidebar.settings'] [role='dialog'] 再也选不中它
   —— 玻璃效果整个失效。官方在面板元素上留了稳定标记 data-shortcut-modal="settings"
   （settings.open 快捷键的 modals: ["settings"] 就是它）。新旧两种选择器都留着；
   --dsh-settings-bg/blur 写在 <html> 上，body 下的 panel 照样继承得到。 */
[data-slot='sidebar.settings'] [role='dialog'],[data-shortcut-modal='settings']{background:var(--dsh-settings-bg)!important;backdrop-filter:blur(var(--dsh-settings-blur));-webkit-backdrop-filter:blur(var(--dsh-settings-blur))}.dsh-appearance-settings{max-width:780px;color:var(--dsw-alias-label-primary)}.dsh-appearance-settings h2{font-size:18px;margin:0 0 10px}.dsh-appearance-settings h3{font-size:13px;margin:18px 0 6px;color:var(--dsw-alias-label-secondary)}.dsh-appearance-settings{max-width:780px;color:var(--dsw-alias-label-primary)}
.dsh-appearance-settings h2{font-size:18px;margin:0 0 10px;letter-spacing:.01em}
.dsh-appearance-settings h3{font-size:12px;margin:22px 0 6px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-weight:600;letter-spacing:.04em}
.dsh-appearance-settings h3:first-of-type{margin-top:12px;padding-top:0;border-top:none}
.dsh-appearance-row{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:38px;padding:5px 0}
.dsh-appearance-row+.dsh-appearance-row{border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l2) 60%,transparent)}
.dsh-appearance-label{flex:0 0 auto;max-width:56%;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.dsh-appearance-control{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex:1 1 auto;min-width:0}
.dsh-appearance-value{flex:none;min-width:46px;padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);text-align:center;font-size:11px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}
.dsh-appearance-range{appearance:none;-webkit-appearance:none;flex:1 1 auto;min-width:90px;height:18px;margin:0;background:transparent;cursor:pointer}
.dsh-appearance-range::-webkit-slider-runnable-track{height:4px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent)}
.dsh-appearance-range::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:14px;height:14px;margin-top:-5px;border-radius:50%;border:2px solid var(--dsw-alias-brand-primary,#1570ef);background:var(--dsw-alias-bg-module-platform,#fff);box-shadow:0 1px 3px rgba(0,0,0,.22);transition:transform .12s ease,box-shadow .12s ease}
.dsh-appearance-range:hover::-webkit-slider-thumb{transform:scale(1.08)}
.dsh-appearance-range:active::-webkit-slider-thumb{transform:scale(1.16)}
.dsh-appearance-range:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 4px color-mix(in srgb,var(--dsw-alias-brand-primary,#1570ef) 26%,transparent)}
.dsh-appearance-range::-moz-range-track{height:4px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent)}
.dsh-appearance-range::-moz-range-thumb{width:12px;height:12px;border-radius:50%;border:2px solid var(--dsw-alias-brand-primary,#1570ef);background:var(--dsw-alias-bg-module-platform,#fff)}
.dsh-appearance-select{position:relative;display:flex;align-items:center;flex:1 1 auto;min-width:0;max-width:260px}
.dsh-appearance-select select{appearance:none;-webkit-appearance:none;width:100%;height:30px;padding:0 28px 0 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-module-platform,#fff);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:28px;text-overflow:ellipsis;cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}
.dsh-appearance-select::after{content:'';position:absolute;right:11px;top:50%;width:6px;height:6px;margin-top:-5px;border-right:1.5px solid var(--dsw-alias-label-secondary);border-bottom:1.5px solid var(--dsw-alias-label-secondary);transform:rotate(45deg);pointer-events:none;opacity:.8}
.dsh-appearance-select:hover select{border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 26%,transparent)}
.dsh-appearance-select select:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary,#1570ef);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary,#1570ef) 24%,transparent)}
.dsh-appearance-color{position:relative;display:inline-flex;width:34px;height:30px;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:2px;background:var(--dsw-alias-bg-module-platform,#fff);cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease}
.dsh-appearance-color:hover{border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 26%,transparent)}
.dsh-appearance-color input[type=color]{width:100%;height:100%;padding:0;border:none;border-radius:6px;background:transparent;cursor:pointer}
.dsh-appearance-color input[type=color]::-webkit-color-swatch-wrapper{padding:0}
.dsh-appearance-color input[type=color]::-webkit-color-swatch{border:none;border-radius:6px}
.dsh-appearance-color input[type=color]:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary,#1570ef) 24%,transparent)}
.dsh-appearance-switch{position:relative;display:inline-flex;width:38px;height:22px;flex:none;cursor:pointer}
.dsh-appearance-switch input{position:absolute;inset:0;margin:0;opacity:0;cursor:pointer}
.dsh-appearance-switch i{position:absolute;inset:0;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent);transition:background .18s ease}
.dsh-appearance-switch i::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.28);transition:transform .18s cubic-bezier(.4,0,.2,1)}
.dsh-appearance-switch input:checked+i{background:var(--dsw-alias-brand-primary,#1570ef)}
.dsh-appearance-switch input:checked+i::after{transform:translateX(16px)}
.dsh-appearance-switch input:focus-visible+i{box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary,#1570ef) 24%,transparent)}
.dsh-appearance-switch input:active+i::after{width:19px}
.dsh-appearance-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:none;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-module-platform,#fff);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:500;white-space:nowrap;cursor:pointer;transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,transform .08s ease}
.dsh-appearance-btn:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent));border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 26%,transparent)}
.dsh-appearance-btn:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary,#1570ef);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary,#1570ef) 24%,transparent)}
.dsh-appearance-btn:active{transform:translateY(.5px)}
.dsh-appearance-btn:disabled{opacity:.6;cursor:progress}
.dsh-appearance-btn-icon{flex:none;display:block;opacity:.85}
.dsh-appearance-hint{margin:6px 0 2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-appearance-notice{margin-top:6px;padding:7px 10px;border-radius:9px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#1570ef) 10%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#1570ef) 26%,transparent)}
.dsh-appearance-previews{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:8px}.dsh-appearance-preview{position:relative;height:210px;border-radius:12px;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}.dsh-preview-bg{position:absolute;inset:0;background-image:var(--dsh-bg-image);background-size:var(--dsh-bg-size);background-repeat:var(--dsh-bg-repeat);background-position:center;opacity:var(--dsh-bg-opacity)}.dsh-preview-conv{position:absolute;inset:14px;border-radius:12px;padding:10px;display:flex;flex-direction:column;background:transparent}.dsh-preview-conv.active{background:var(--dsh-conv-bg);backdrop-filter:blur(var(--dsh-conv-blur));-webkit-backdrop-filter:blur(var(--dsh-conv-blur))}.dsh-preview-msgs{flex:1;display:flex;flex-direction:column;gap:6px;overflow:hidden}.dsh-preview-msg{align-self:flex-start;max-width:80%;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:6px 10px;font-size:11px;color:var(--dsw-alias-label-primary)}.dsh-preview-msg.self{align-self:flex-end;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-inverse, #fff)}.dsh-preview-chat{margin-top:10px;background:var(--dsh-composer-bg);backdrop-filter:blur(var(--dsh-composer-blur));-webkit-backdrop-filter:blur(var(--dsh-composer-blur));border:var(--dsh-composer-border);border-radius:var(--dsh-composer-radius);padding:9px 12px;font-size:11px;color:var(--dsw-alias-label-primary)}@media(max-width:640px){.dsh-appearance-previews{grid-template-columns:1fr}}`

  const appearanceRootStyles = new Map()
  let appearanceThemeDisposer = null

  function applyBackground(s, theme) {
    const root = document.documentElement
    const set = (k, v) => {
      const appliedValue = String(v)
      if (!appearanceRootStyles.has(k)) appearanceRootStyles.set(k, [root.style.getPropertyValue(k), root.style.getPropertyPriority(k), appliedValue])
      else appearanceRootStyles.get(k)[2] = appliedValue
      root.style.setProperty(k, appliedValue)
    }
    const size = s.bgSize === 'tile' ? 'auto' : s.bgSize === 'stretch' ? '100% 100%' : s.bgSize === 'contain' ? 'contain' : s.bgSize || 'cover'
    const repeat = s.bgSize === 'tile' ? 'repeat' : 'no-repeat'
    const bgUrl = s.bgImage ? `url("${s.bgImage}")` : ''
    // Once the real wallpaper layer exists, drop the early full-opacity <html> wallpaper
    // so lowering the wallpaper transparency reveals a plain base, not a second image copy.
    if (document.querySelector('.dsh-appearance-bg')) {
      document.getElementById('dsh-ui-appearance-preload')?.remove()
      // 移除 host 首帧注入的 <style>（含标记），避免它盖住壁纸透明度/白底效果。
      document.querySelectorAll('style').forEach((el) => { if (el.textContent && el.textContent.includes('dsh-ui-appearance-head')) el.remove() })
    }
    // 遮罩层背景跟随 --dsh-wash-bg(=遮罩颜色+浓度)；无壁纸时透明。
    const washEl = document.querySelector('.dsh-appearance-wash')
    if (washEl) washEl.style.background = bgUrl ? 'var(--dsh-wash-bg)' : 'transparent'
    let el = document.getElementById('dsh-ui-appearance-bg-css')
    if (!el) { el = document.createElement('style'); el.id = 'dsh-ui-appearance-bg-css'; document.head.appendChild(el) }
    // Base under a (possibly fading) wallpaper: while a wallpaper is active, faded area is a plain white base.
    const baseCss = bgUrl ? 'html{background-color:#ffffff!important}body{background:#ffffff!important}' : 'html, body { background-color: transparent !important; } body { background: transparent !important; }'
    // 侧边栏滚动渐隐条：0.2.2 起官方把它从 workspace 的 treeBody 里挪到了侧栏骨架自己的
    // scrollRegion 底部，类名也从 `..._fade_...` 变成 `..._scrollFade_...`（含大写 F），
    // 旧规则整个失效。该条的底色是**不透明**的 --dsw-specific-sidebar-fill，而本插件把
    // 侧栏做成了半透明，于是在壁纸上露出一条 24px 的白条。这里一并清掉新位置。
    el.textContent = baseCss + ' [class*="frame"], [class*="centerCol"] { background: transparent !important; } [role="dialog"]{z-index:10!important} [class*="sidebarCol"] [class*="treeBody"] [class*="fade"], [class*="sidebarCol"] [class*="scrollFade"] { background: none !important; }'
    const tokens = {}
    if (bgUrl) {
      tokens['--dsw-alias-bg-base'] = { light: 'rgba(0,0,0,0)', dark: 'rgba(0,0,0,0)' }
    }
    try {
       appearanceThemeDisposer?.()
       appearanceThemeDisposer = typeof theme?.overrideTokens === 'function' ? theme.overrideTokens(NS, tokens) : null
     } catch { appearanceThemeDisposer = null }
    document.querySelectorAll('[class*="sidebarCol"], [class*="sidebarCol"] [data-slot="sidebar"] > [class*="root"]').forEach((sidebar) => {
        sidebarStyleElements.add(sidebar)
        rememberStyle(sidebarStyleState, sidebar, ['background', 'position', 'width', 'min-width', 'height', 'overflow', 'z-index'])
        const opacity = Math.max(0, Math.min(1, Number.isFinite(Number(s.sidebarOpacity)) ? Number(s.sidebarOpacity) : 0.85)) * 100
       const fill = `color-mix(in srgb,var(--dsw-specific-sidebar-fill) ${opacity}%,transparent)`
       const ownsFill = String(sidebar.className || '').includes('root')
       sidebar.style.setProperty('background', ownsFill ? fill : 'transparent', 'important')
      })
     document.querySelectorAll('button[class*="newSession"]').forEach((el) => {
         sidebarStyleElements.add(el)
         rememberStyle(sidebarStyleState, el, ['background'])
         const opacity = Math.max(0, Math.min(1, Number.isFinite(Number(s.sidebarOpacity)) ? Number(s.sidebarOpacity) : 0.85)) * 100
         const fill = `color-mix(in srgb,var(--dsw-specific-sidebar-fill) ${opacity}%,transparent)`
         el.style.setProperty('background', fill, 'important')
      })

       const autoHide = !!s.sidebarAutoHide
     const frameRoot = document.querySelector('[class*="frame"]')
     if (frameRoot) {
        rememberStyle(frameStyleState, frameRoot, ['grid-template-columns', 'transition'])
       frameRoot.setAttribute('data-dsh-auto-hide', String(autoHide))
       const sideRootEl = document.querySelector('[class*="sidebarCol"] [data-slot="sidebar"] > [class*="root"]')
       const sideWidth = sideRootEl ? Math.round(sideRootEl.getBoundingClientRect().width) : 0
       const wideW = sideWidth > 50 ? sideWidth : (sidebarWideWidth > 50 ? sidebarWideWidth : 280)
       syncFrameColumns(frameRoot, autoHide, wideW, instantSidebarExpand)
     }
     applySidebarColumns(s)
     tagMainPanels()

const bgDiv = document.querySelector('.dsh-appearance-bg')
    if (bgDiv) {
      bgDiv.style.backgroundImage = bgUrl || 'none'
      bgDiv.style.backgroundSize = size
      bgDiv.style.backgroundRepeat = repeat
      bgDiv.style.backgroundPosition = 'center'
      bgDiv.style.display = bgUrl ? 'block' : 'none'
    }
    set('--dsh-bg-image', bgUrl || 'none'); set('--dsh-bg-size', size); set('--dsh-bg-repeat', repeat)
    set('--dsh-bg-opacity', s.bgOpacity); set('--dsh-bg-blur', `${s.bgBlur}px`)
    set('--dsh-wash-bg', rgba(s.bgMask, s.bgMaskOpacity))
    set('--dsh-parallax-easing', s.parallaxEasing)
    set('--dsh-conv-bg', s.conversationEnabled ? rgba(s.conversationColor, s.conversationOpacity) : 'transparent'); set('--dsh-conversation-width', `${Math.max(320, Number(s.conversationWidth) || 760)}px`)
    set('--dsh-conv-solid', s.conversationEnabled ? s.conversationColor : 'transparent')
    set('--dsh-conv-blur', s.conversationEnabled ? `${s.conversationBlur}px` : '0px')
    set('--dsh-composer-bg', rgba(s.chatBoxColor, s.chatBoxOpacity)); set('--dsh-composer-blur', `${s.chatBoxBlur}px`); set('--dsh-composer-border', borderValue(s.chatBoxBorder)); set('--dsh-composer-radius', `${s.chatBoxRadius}px`)
    set('--dsh-settings-bg', rgba(s.settingsColor, s.settingsOpacity)); set('--dsh-settings-blur', `${s.settingsBlur}px`); set('--dsh-sidebar-opacity', `${Math.max(0, Math.min(1, Number.isFinite(Number(s.sidebarOpacity)) ? Number(s.sidebarOpacity) : 0.85)) * 100}%`)
    // 文档预览弹窗（0.1.5"弹窗预览"）与会话区共享玻璃设置：这里只挂开关和内缩，
    // 底色/透明度/毛玻璃强度全部复用 --dsh-conv-*，不新增一套独立参数。
    document.documentElement.setAttribute('data-dsh-popup-sync', String(s.previewPopupShared !== false))
    set('--dsh-popup-inset', `${Math.max(0, Math.min(48, Number.isFinite(Number(s.previewPopupInset)) ? Number(s.previewPopupInset) : 12))}px`)
  }

  function LivePreview({ s }) {
    const source = typeof document !== 'undefined' ? document.querySelector('[data-phase="active"]') : null
    const page = source ? source.outerHTML : '<div data-phase="active"><div data-conversation-scroll><div data-slot="conversation.session" data-dsh-appearance-session><div data-variant="think">Think</div></div><div data-composer-seat data-dsh-appearance-seat><div data-dsh-appearance-composer><textarea placeholder="Compose..."></textarea></div></div></div></div>'
    const styles = typeof document !== 'undefined' ? [...document.querySelectorAll('style')].map((el) => el.textContent).join('\n') : ''
    const bg = s.bgImage ? `url("${String(s.bgImage).replace(/"/g, '\\"')}")` : 'none'
    const conv = s.conversationEnabled ? rgba(s.conversationColor, s.conversationOpacity) : 'transparent'
    const composer = rgba(s.chatBoxColor, s.chatBoxOpacity)
    const border = borderValue(s.chatBoxBorder)
    const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>${styles}</style><style>
      html,body{margin:0!important;width:100%;height:100%;overflow:hidden!important;background:transparent!important}
      body{font-family:system-ui,sans-serif}
      .dsh-live-page{position:relative;width:100%;height:100%;overflow:hidden;background:transparent}
      .dsh-live-bg{position:absolute;inset:0;background-image:${bg};background-size:${s.bgSize === 'tile' ? 'auto' : s.bgSize === 'stretch' ? '100% 100%' : s.bgSize};background-repeat:${s.bgSize === 'tile' ? 'repeat' : 'no-repeat'};background-position:center;opacity:${s.bgOpacity};filter:blur(${s.bgBlur}px)}
      .dsh-live-center{position:relative;width:100%;height:100%;overflow:hidden;transform-origin:top left}
      .dsh-live-center>[data-phase="active"]{width:calc(100% - 32px)!important;height:calc(100% - 32px)!important;margin:16px!important;padding:10px!important;border-radius:12px!important;box-sizing:border-box!important;background:${conv}!important;backdrop-filter:blur(${s.conversationBlur}px)!important}
      .dsh-live-center [data-composer-seat]{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}
      .dsh-live-center [data-dsh-appearance-composer]{background:${composer}!important;border:${border}!important;border-radius:${s.chatBoxRadius}px!important;backdrop-filter:blur(${s.chatBoxBlur}px)!important}
      .dsh-live-center [data-conversation-scroll]{display:grid!important;grid-template-rows:minmax(0,1fr) auto!important;min-height:0!important;overflow:hidden!important}
       .dsh-live-center [data-conversation-scroll] > [data-dsh-appearance-session]{grid-row:1;display:flex!important;flex-direction:column!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important}
       .dsh-live-center [data-conversation-scroll] > [data-dsh-appearance-seat]{grid-row:2;min-height:0!important;overflow:visible!important}
      .dsh-live-center [data-slot="conversation.session"] [data-variant]{flex:0 1 auto!important;height:auto!important;max-height:none!important}
      .dsh-live-center [data-slot="conversation.session"] [data-variant="think"]{display:flex!important;flex:0 1 auto!important;height:auto!important;overflow:visible!important}
      .dsh-live-center [data-slot="conversation.session"] [data-variant="think"] [class*="thinkBody"]{display:block!important;height:auto!important;overflow:visible!important}
      .dsh-live-center .Md3f7G_scroll{overflow-y:auto!important;scrollbar-width:none!important}
      .dsh-live-center .Md3f7G_scroll::-webkit-scrollbar{display:none}
      .dsh-live-center [data-slot="conversation.session"]{pointer-events:none!important}
    </style></head><body><div class="dsh-live-page"><div class="dsh-live-bg"></div><div class="dsh-live-center centerCol">${page}</div></div></body></html>`
    return h('iframe', { className: 'dsh-live-preview', title: '实时网页预览', srcDoc, scrolling: 'no' })
  }

  function Preview({ mode, s }) {
    return h('div', { className: 'dsh-appearance-preview dsh-live-preview-shell', 'data-preview-mode': mode }, h(LivePreview, { s }))
  }

  function Panel() {
    const [s, setS] = React.useState(load())
    const [files, setFiles] = React.useState([])
    const [revealing, setRevealing] = React.useState(false)
    const [notice, setNotice] = React.useState('')
    const update = (key, value) => { const next = { ...s, [key]: value }; stateRevision += 1; setS(next); persist(next); current = next; applyBackground(next, window.__dshClientTheme || null) }
    React.useEffect(() => { applyBackground(s, window.__dshClientTheme || null); current = s }, [s])
    // 壁纸名字由宿主给（解码后的原文件名）。兼容旧接口只回 URL 的情况：自己解一次码，
    // 否则中文文件名会显示成 %E5%B0%91%E5%A5%B3 这种样子。
    const normalize = (item) => {
      if (typeof item === 'string') {
        const raw = item.split('/').pop() || item
        return { url: item, name: decodeURIComponent(raw) }
      }
      const url = String(item?.url ?? '')
      const name = item?.name ? String(item.name) : decodeURIComponent(url.split('/').pop() || '')
      return { url, name }
    }
    const refreshFiles = () => fetch('/bg/list')
      .then((r) => r.json())
      .then((list) => { const items = (Array.isArray(list) ? list : []).map(normalize).filter((f) => f.url); setFiles(items); return items })
      .catch(() => [])
    React.useEffect(() => { void refreshFiles() }, [])
    const revealFolder = () => {
      if (revealing) return
      setRevealing(true)
      fetch('/bg/reveal', { method: 'POST' })
        .then((r) => r.json())
        .then((x) => { setNotice(x && x.opened ? '已在文件管理器中打开壁纸文件夹' : '打不开文件夹，请手动打开 dsh-ui-appearance 的 assets/backgrounds'); return refreshFiles() })
        .catch(() => setNotice('打不开文件夹，请手动打开 dsh-ui-appearance 的 assets/backgrounds'))
        .finally(() => { setRevealing(false); setTimeout(() => setNotice(''), 4000) })
    }
    // 选中的壁纸可能已经不在文件夹里（手工删了、换过机器）：下拉框仍要能显示它。
    const missing = s.bgImage && !files.some((f) => f.url === s.bgImage) ? normalize(s.bgImage) : null
    const row = (label, control) => h('div', { className: 'dsh-appearance-row' }, h('span', { className: 'dsh-appearance-label' }, label), h('div', { className: 'dsh-appearance-control' }, control))
    const slider = (label, key, min, max, scale, unit) => row(label, [
      h('input', { key: 'in', className: 'dsh-appearance-range', type: 'range', min, max, step: 1, value: s[key] * scale, onChange: (e) => update(key, Number(e.target.value) / scale) }),
      h('span', { key: 'v', className: 'dsh-appearance-value' }, `${Math.round(s[key] * scale)}${unit}`),
    ])
    const colorRow = (label, key) => row(label, h('label', { className: 'dsh-appearance-color' }, h('input', { type: 'color', value: s[key], onChange: (e) => update(key, e.target.value) })))
    const selectRow = (label, key, options) => row(label, h('span', { className: 'dsh-appearance-select' }, h('select', { value: s[key], onChange: (e) => update(key, e.target.value) }, options.map((o) => h('option', { key: o.value, value: o.value }, o.label)))))
    const checkRow = (label, key) => row(label, h('label', { className: 'dsh-appearance-switch' }, h('input', { type: 'checkbox', checked: !!s[key], onChange: (e) => update(key, e.target.checked) }), h('i', { 'aria-hidden': 'true' })))
    const folderIcon = h('svg', { className: 'dsh-appearance-btn-icon', viewBox: '0 0 16 16', width: 15, height: 15, fill: 'none', 'aria-hidden': 'true' },
      h('path', { d: 'M1.9 4.1a1.2 1.2 0 0 1 1.2-1.2h3.1l1.35 1.5h5.5a1.2 1.2 0 0 1 1.2 1.2v6.3a1.2 1.2 0 0 1-1.2 1.2H3.1a1.2 1.2 0 0 1-1.2-1.2V4.1Z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }))
    const wallpaperRow = row('壁纸', [
      h('span', { key: 'sel', className: 'dsh-appearance-select' }, h('select', { value: s.bgImage, onChange: (e) => update('bgImage', e.target.value) },
        h('option', { value: '' }, '不使用壁纸'),
        files.map((f) => h('option', { key: f.url, value: f.url }, f.name)),
        missing ? h('option', { key: 'missing', value: missing.url }, `${missing.name}（已不在文件夹中）`) : null)),
      h('button', { key: 'btn', type: 'button', className: 'dsh-appearance-btn', onClick: revealFolder, disabled: revealing }, folderIcon, revealing ? '正在打开…' : '壁纸文件夹'),
    ])
      return h('div', { className: 'dsh-appearance-settings' },
        h('h2', null, '外观'),
        h('h3', null, '壁纸背景'),
        wallpaperRow,
        h('div', { className: 'dsh-appearance-hint' }, '把图片放进壁纸文件夹（JPEG / PNG / WebP / GIF，单张不超过 12 MB），它会出现在下拉框里。'),
        notice && h('div', { className: 'dsh-appearance-notice' }, notice),
        selectRow('尺寸模式', 'bgSize', [{ value: 'cover', label: '裁切 Cover' }, { value: 'contain', label: '居中 Contain' }, { value: 'tile', label: '平铺 Tile' }, { value: 'stretch', label: '拉伸 Stretch' }, { value: 'auto', label: '适应 Auto' }]),
        slider('壁纸透明度', 'bgOpacity', 0, 100, 100, '%'),
        slider('壁纸模糊', 'bgBlur', 0, 60, 1, 'px'),
        colorRow('遮罩颜色', 'bgMask'),
        slider('遮罩浓度', 'bgMaskOpacity', 0, 100, 100, '%'),
        h('h3', null, '视差动效'),
        checkRow('启用视差', 'parallaxEnabled'),
        slider('移动幅度', 'parallaxAmplitude', 0, 50, 1, 'px'),
        selectRow('缓动速度', 'parallaxEasing', [{ value: 'ease-out', label: '缓出' }, { value: 'ease-in', label: '缓入' }, { value: 'ease-in-out', label: '缓入缓出' }]),
        h('h3', null, '侧边栏'),
        slider('透明度', 'sidebarOpacity', 0, 100, 100, '%'),
        checkRow('自动隐藏到左侧', 'sidebarAutoHide'),
        checkRow('首次滑入前预热（减少首帧卡顿）', 'prewarmFirstSlide'),
        h('h3', null, '会话对话区'),
        checkRow('启用区分', 'conversationEnabled'),
        slider('透明度', 'conversationOpacity', 0, 100, 100, '%'),
        slider('毛玻璃强度', 'conversationBlur', 0, 60, 1, 'px'),
        colorRow('遮罩颜色', 'conversationColor'),
        slider('对话框宽度', 'conversationWidth', 420, 1200, 1, 'px'),
        checkRow('插件/任务页也用会话卡片', 'pageCard'),
        checkRow('应用到文档预览弹窗', 'previewPopupShared'),
        slider('弹窗外边距（上/下/右）', 'previewPopupInset', 0, 40, 1, 'px'),
        h('h3', null, '聊天框'),
        colorRow('背景颜色', 'chatBoxColor'),
        slider('透明度', 'chatBoxOpacity', 0, 100, 100, '%'),
        selectRow('边框样式', 'chatBoxBorder', [{ value: 'none', label: '无' }, { value: 'thin', label: '细' }, { value: 'thick', label: '粗' }]),
        slider('圆角大小', 'chatBoxRadius', 0, 24, 1, 'px'),
        h('h3', null, '设置面板'),
        slider('透明度', 'settingsOpacity', 0, 100, 100, '%'),
        slider('毛玻璃强度', 'settingsBlur', 0, 60, 1, 'px'),
        colorRow('背景颜色', 'settingsColor'))

    }

  function apply(ctx) {
    const slots = ctx.slots
    const theme = ctx.theme
    if (!slots) return
    try { window.__dshClientTheme = theme } catch {}
    ctx.effect(() => {
       let active = true
       applyBackground(current, theme)
             const tag = document.createElement('style'); tag.dataset.pluginCss = NS; tag.textContent = STYLE; document.head.appendChild(tag)
      // 弹窗外观单独一张样式表：与主样式表解耦（主表整段由 STYLE 常量一次性给出，这里不往里
      // 追加任何东西），这条规则也就稳定处在顶层，不会因为主表结构变化而被解析成嵌套规则。
      const popupTag = document.createElement('style'); popupTag.dataset.pluginCss = NS + ':popup'; popupTag.textContent = POPUP_STYLE; document.head.appendChild(popupTag)
      // 主面板卡片单独一张样式表（同 popup 的理由：主样式表一次性给出、不往里追加）。
      const pageTag = document.createElement('style'); pageTag.dataset.pluginCss = NS + ':page'; pageTag.textContent = PAGE_STYLE; document.head.appendChild(pageTag)
      // 右栏容器入场动画的闸门（见 README §3.6）：插件第一次应用样式时会把面板从 none
      // 推到 translateX(100%+内缩)，如果过渡此刻就已生效，面板会在页面加载时自己滑出去一次。
      // 先禁用过渡，等右栏第一次真正展开（或 3s 超时）再放行。
      try { document.documentElement.setAttribute('data-dsh-popup-anim', 'false') } catch { /* 无 document 时安静 */ }
       
       const bg = document.createElement('div'); bg.className = 'dsh-appearance-bg'; document.body.prepend(bg)
       // 遮罩层：整屏盖在壁纸(z-index:0)上方、内容(frame z-index:2)下方；背景=--dsh-wash-bg。
       const wash = document.createElement('div'); wash.className = 'dsh-appearance-wash'
       Object.assign(wash.style, { position: 'fixed', inset: '0', zIndex: '1', pointerEvents: 'none', background: 'var(--dsh-wash-bg)' })
       bg.insertAdjacentElement('afterend', wash)
      
      applyBackground(current, theme)
             const preloadTag = document.getElementById('dsh-ui-appearance-preload')
       let preloadProbe = null
       let preloadTimeout = null
       const finishPreload = () => {
         if (!active || !preloadTag || !preloadTag.isConnected || document.getElementById('dsh-ui-appearance-preload') !== preloadTag) return
         preloadTag.remove()
       }
       if (current.bgImage) {
         preloadProbe = new Image()
         preloadProbe.onload = finishPreload
         preloadProbe.onerror = () => { preloadTimeout = setTimeout(finishPreload, 300) }
         preloadProbe.src = current.bgImage
       } else finishPreload()
       // Cold-start self-heal: on a real app start the page can mount before
       // the host plugin's /bg routes are serving (or before the configured
       // image file is reachable), so a one-shot /bg/config fetch would 404
       // and leave the wallpaper blank until a manual refresh. Retry briefly
       // so the background appears as soon as the host is ready.
       let bootTimer = null
       const bootDelay = (ms) => new Promise((resolve) => { bootTimer = setTimeout(resolve, ms) })
       const bootImageReady = (url) => new Promise((resolve) => {
         if (!url) return resolve(true)
         const im = new Image()
         im.onload = () => resolve(true)
         im.onerror = () => resolve(false)
         im.src = url
       })
       const bootPaint = (s) => { applyBackground(s, theme); preloadBackground(s); tagDom() }
       const bootWallpaper = async () => {
         for (let i = 0; i < 48 && active; i++) {
           let reachable = false
           let cfg = null
           try {
             const res = await fetch('/bg/config')
             if (res.ok) { reachable = true; cfg = await res.json() }
           } catch { /* host not ready yet */ }
           if (reachable && cfg && typeof cfg === 'object') {
             current = { ...defaults, ...current, ...cfg }
             try { localStorage.setItem(STORE_KEY, JSON.stringify(current)) } catch {}
           }
           if (!current.bgImage) {
             if (reachable) { bootPaint(current); return }  // authoritative: no wallpaper chosen
             await bootDelay(300)
             continue
           }
           bootPaint(current)
           if (await bootImageReady(current.bgImage)) return  // image served: background active
           await bootDelay(250)
         }
       }
       void bootWallpaper()
       let frame
      let lastParallax = ''
       const move = (e) => {
         const s = current
         if (!s.parallaxEnabled || !s.bgImage) return
         const x = Math.round((e.clientX / innerWidth - 0.5) * 2 * -s.parallaxAmplitude * 2) / 2
         const y = Math.round((e.clientY / innerHeight - 0.5) * 2 * -s.parallaxAmplitude * 2) / 2
         const next = x + ',' + y
         if (next === lastParallax) return
         lastParallax = next
         cancelAnimationFrame(frame)
         // translate3d 走合成器；值没变就完全不写，避免壁纸层的 backdrop 反复重算。
         frame = requestAnimationFrame(() => { bg.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)' })
       }
       document.addEventListener('mousemove', move)
       // Hover 展开/收起：合并到每帧一次，并且只在"展开状态真的变了"时才写样式。
       // 原来每次 mousemove 都会 syncSidebarRoot → 量一次 root 的 rect + 重写 transition/margin，
       // 也就是每次指针移动都强制一次同步布局；滑入的那 220ms 里就是每帧一次。
       let sidebarHoverFrame = 0
       let sidebarHoverEvent = null
       const applySidebarHover = (e) => {
         const autoHide = !!current.sidebarAutoHide
         document.querySelectorAll('[class*="sidebarCol"]').forEach((sidebar) => {
           if (!autoHide) {
             if (sidebar.getAttribute('data-dsh-sidebar-revealed') !== 'true') {
               sidebar.setAttribute('data-dsh-sidebar-revealed', 'true')
               sidebarRevealed = true
             }
             return
           }
           const root = sidebar.querySelector('[data-slot="sidebar"] > [class*="root"]')
           const target = e.target
           const revealed = e.clientX <= 20 || (root && (() => { const rect = root.getBoundingClientRect(); return rect.width > 0 && e.clientX >= rect.left - 4 && e.clientX <= rect.right + 4 && e.clientY >= rect.top - 8 && e.clientY <= rect.bottom + 8 })()) || !!(root && (root === target || root.contains(target) || root.matches(':hover')))
           sidebarRevealed = revealed
           if (sidebar.getAttribute('data-dsh-sidebar-revealed') === String(revealed)) return
           sidebar.setAttribute('data-dsh-sidebar-revealed', String(revealed))
           enterMotion(260)
           syncSidebarRoot(sidebar, true)
         })
       }
       const sidebarHover = (e) => {
         sidebarHoverEvent = e
         if (sidebarHoverFrame !== 0) return
         sidebarHoverFrame = requestAnimationFrame(() => { sidebarHoverFrame = 0; if (active && sidebarHoverEvent) applySidebarHover(sidebarHoverEvent) })
       }
       document.addEventListener('mousemove', sidebarHover)
       // 静默预热：启动后挑一段空闲时间做，最多试 6 次（DOM 可能还没就绪）；用户期间
       // 一旦已经把侧栏展开，prewarmSidebar 自己会放弃。
       let prewarmTimer = null
       let prewarmTries = 0
       const schedulePrewarm = (delay) => {
         if (prewarmTimer !== null) { clearTimeout(prewarmTimer); prewarmTimer = null }
         const run = () => {
           prewarmTimer = null
           if (!active) return
           if (prewarmSidebar()) return
           if (prewarmTries < 6 && !sidebarWarmed) { prewarmTries += 1; schedulePrewarm(900) }
         }
         prewarmTimer = setTimeout(() => {
           // 预热本身要画一帧，别和首屏/首轮渲染抢时间，交给空闲回调。
           if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 })
           else run()
         }, delay)
       }
       schedulePrewarm(1200)
             let conversationScrollFrame
        let conversationScrollElement = null
        let conversationScrollListener = null
        let conversationScrollHost = null
        let conversationScrollHostPosition = null
        let conversationRoot = null
        let latestButton = null
        let followConversation = true
       // 气泡按钮的位置原来是每帧量 offsetWidth/clientWidth/offsetHeight 再写样式（一次强制布局），
       // 而它只在容器尺寸或输入框高度变化时才会变。改成量一次、变了才写。
       let latestMetrics = { right: -1, bottom: -1 }
        let scrollIdleTimer = 0
       const measureLatestButton = (scroll) => {
         if (!latestButton || !scroll) return
         const right = Math.max(8, scroll.offsetWidth - scroll.clientWidth + 8)
         const seat = conversationScrollHost ? conversationScrollHost.querySelector('[data-composer-seat]') : null
         const bottom = (seat ? seat.offsetHeight : 0) + 8
         if (right === latestMetrics.right && bottom === latestMetrics.bottom) return
         latestMetrics = { right, bottom }
         latestButton.style.right = right + 'px'
         latestButton.style.bottom = bottom + 'px'
       }
       const scrollConversationToLatest = (force = false) => {
         const active = document.querySelector('[data-phase="active"]')
         if (!active) return
          if (active !== conversationRoot) {
            conversationRoot = active
            followConversation = true
            conversationScrollElement = null
          }
         
         
         
         const scrollBody = active.querySelector('[data-conversation-scroll]')
          const scroll = scrollBody && (scrollBody.querySelector(':scope > [data-slot="conversation.session"]') || scrollBody.querySelector('[data-slot="conversation.session"]'))

                   if (!scroll) return
          if (scroll !== conversationScrollElement) {
          // 只在换滚动容器时写：原来每次同步都写，等于每帧制造一次样式失效。
          scroll.style.setProperty('overflow-y', 'auto', 'important')
          scroll.style.setProperty('overflow-x', 'hidden', 'important')
          if (scrollBody) scrollBody.style.setProperty('overflow', 'hidden', 'important')
             if (conversationScrollElement && conversationScrollListener) conversationScrollElement.removeEventListener('scroll', conversationScrollListener)
            conversationScrollElement = scroll
            conversationScrollListener = () => {
              const distance = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop
              followConversation = distance <= 24
              if (latestButton) latestButton.hidden = distance <= 24
            }
             scroll.addEventListener('scroll', conversationScrollListener, { passive: true })
          }
         
         const scrollHost = scroll.parentElement || active
          if (conversationScrollHost !== scrollHost) {
             if (conversationScrollHost && conversationScrollHostPosition !== null) { if (conversationScrollHostPosition[0]) conversationScrollHost.style.setProperty('position', conversationScrollHostPosition[0], conversationScrollHostPosition[1]); else conversationScrollHost.style.removeProperty('position') }
             conversationScrollHost = scrollHost
             conversationScrollHostPosition = [scrollHost.style.getPropertyValue('position'), scrollHost.style.getPropertyPriority('position')]
             scrollHost.style.setProperty('position', 'relative')
           }
           if (latestButton && latestButton.parentElement !== scrollHost) {
            scrollHost.style.setProperty('position', 'relative')
            scrollHost.appendChild(latestButton)
          }
          if (followConversation || force) scroll.scrollTop = scroll.scrollHeight
          if (latestButton) latestButton.hidden = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 24
          // 首次（还没量过）补量一次；之后只在全量同步/窗口 resize 时重算。
          if (latestButton && latestMetrics.right < 0) measureLatestButton(scroll)
       }
       const scheduleConversationScroll = () => {
          cancelAnimationFrame(conversationScrollFrame)
          conversationScrollFrame = requestAnimationFrame(() => {
            scrollConversationToLatest()
            // 第二帧：等流式内容完成布局后再贴到底，思考过程才跟得上。
            requestAnimationFrame(() => scrollConversationToLatest())
          })
        }
        const ensureLatestButton = () => {
          const active = document.querySelector('[data-phase="active"]')
          if (!active) return
          if (latestButton && latestButton.isConnected && latestButton.closest('[data-phase="active"]') === active) return
          latestButton?.remove()
          latestButton = document.createElement('button')
          latestButton.type = 'button'
           latestButton.textContent = '↓'
          latestButton.dataset.dshLatestButton = 'true'
            latestButton.title = '返回最新对话'
            latestButton.setAttribute('aria-label', '返回最新对话')
          latestButton.hidden = true
          Object.assign(latestButton.style, { position: 'absolute', right: '20px', bottom: '20px', zIndex: '20', width: '36px', height: '36px', border: '1px solid rgba(120,130,145,.35)', borderRadius: '50%', background: 'rgba(255,255,255,.92)', color: 'inherit', boxShadow: '0 4px 14px rgba(0,0,0,.16)', cursor: 'pointer', fontSize: '20px', lineHeight: '1' })
          latestButton.addEventListener('click', () => { followConversation = true; scrollConversationToLatest(true) })
          active.appendChild(latestButton)
        }
        const tagDom = () => {
         document.querySelectorAll('[data-phase="active"] button:not([data-dsh-latest-button])').forEach((button) => {
           const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''} ${button.textContent || ''}`.toLowerCase()
             if (/bottom|latest|scroll/.test(label)) button.style.setProperty('display', 'none', 'important')
          })

           const autoHideFrame = document.querySelector('[class*="frame"]')
          
                      const autoHide = !!current.sidebarAutoHide
            /* 0.2.0 有两个官方开关：侧栏自带的那个（Windows 下被钉进标题栏左上角），以及整列
               隐藏时框架 `shell.leading` 座里的 HeaderLeadingControls（没有 `toggle` 类名、
               也不在 sidebarCol 内）。两个都同步标签；leading 座里只认第一个按钮，且先排除
               "新建会话"，避免把标签贴到隔壁按钮上。 */
            const applyToggleLabel = (button) => {
              if (!button) return
              button.setAttribute('aria-label', autoHide ? '取消隐藏侧边栏' : '隐藏侧边栏')
              button.setAttribute('aria-pressed', String(autoHide))
            }
            applyToggleLabel(document.querySelector('[class*="sidebarCol"] button[class*="toggle"]'))
            const leadingSeat = document.querySelector('[class*="leadingSeat"]')
            const leadingButton = leadingSeat ? leadingSeat.querySelector('[class*="controls"] button') : null
            if (leadingButton && !/新建|新会话|new session/i.test(`${leadingButton.getAttribute('aria-label') || ''} ${leadingButton.getAttribute('title') || ''}`)) applyToggleLabel(leadingButton)
          if (autoHideFrame) autoHideFrame.setAttribute('data-dsh-auto-hide', String(autoHide));
          document.querySelectorAll('[class*="sidebarCol"]').forEach((sidebar) => {
        rememberStyle(sidebarStyleState, sidebar, ['background', 'position', 'width', 'min-width', 'height', 'overflow', 'z-index'])
            sidebar.setAttribute('data-dsh-auto-hide', String(autoHide))
            if (!autoHide) sidebar.setAttribute('data-dsh-sidebar-revealed', 'true')
            else sidebar.setAttribute('data-dsh-sidebar-revealed', String(sidebarRevealed))
            syncSidebarRoot(sidebar, autoHide)
          })

          const activePhase = document.querySelector('[data-phase="active"]')
          const heroPhase = document.querySelector('[data-phase="hero"]')
          const settlingPhase = document.querySelector('[data-phase="settling"]')
          const seat = activePhase?.querySelector('[data-composer-seat]') || heroPhase?.querySelector('[data-composer-seat]') || settlingPhase?.querySelector('[data-composer-seat]') || document.querySelector('[data-composer-seat]')
         document.querySelectorAll('[data-dsh-appearance-session], [data-dsh-appearance-seat]').forEach((el) => {
           el.removeAttribute('data-dsh-appearance-session')
           el.removeAttribute('data-dsh-appearance-seat')
         })
         const scrollBody = seat?.closest('[data-conversation-scroll]')
         const session = scrollBody?.querySelector('[data-slot="conversation.session"]')
         if (session) session.setAttribute('data-dsh-appearance-session', '')
         if (seat && scrollBody && seat.parentElement === scrollBody) seat.setAttribute('data-dsh-appearance-seat', '')
        const editable = seat ? seat.querySelector('textarea,[contenteditable=true]') : null
        let target = editable ? editable.parentElement : null
        if (target) {
          for (let i = 0; i < 6 && target; i++) {
            const cls = String(target.className || '')
            if (cls.includes('card')) break
            target = target.parentElement
          }
          if (target && target !== editable) target.setAttribute('data-dsh-appearance-composer', '')
        }
        document.querySelectorAll('[data-dsh-appearance-composer]').forEach((el) => {
          if (el !== target) el.removeAttribute('data-dsh-appearance-composer')
        })
        tagMainPanels()
      }
      tagDom()
             let sidebarRestoreFrame
       ensureLatestButton()
        scheduleConversationScroll()
       const sidebarToggleClick = (e) => {
         const path = typeof e.composedPath === 'function' ? e.composedPath() : []
         const button = path.find((node) => node && node.nodeType === 1 && node.matches && node.matches('[class*="sidebarCol"] button[class*="toggle"]')) || (e.target && e.target.closest ? e.target.closest('[class*="sidebarCol"] button[class*="toggle"]') : null)
          if (!button) return
                     if (e.type === 'mousedown' && sidebarPointerHandledAt > 0 && performance.now() - sidebarPointerHandledAt < 500) {
             e.preventDefault()
             e.stopImmediatePropagation()
             return
           }
           if (e.type === 'click' && sidebarPointerHandledAt > 0 && performance.now() - sidebarPointerHandledAt < 500) {
             e.preventDefault()
             e.stopImmediatePropagation()
             return
           }
           if (e.type === 'pointerdown') sidebarPointerHandledAt = performance.now()
           e.preventDefault()
           e.stopImmediatePropagation()
         const wasAutoHide = !!current.sidebarAutoHide
         const revealedNow = sidebarRevealed
          const nativeSidebar = document.querySelector('[class*="sidebarCol"] [data-slot="sidebar"] > [class*="root"]')
          const measuredWidth = nativeSidebar ? nativeSidebar.getBoundingClientRect().width : 0
          if (measuredWidth > 200) sidebarWideWidth = measuredWidth
          const frameRoot = document.querySelector('[class*="frame"]')
          if (wasAutoHide) document.querySelectorAll('[class*="sidebarCol"] [data-slot="sidebar"] > [class*="root"]').forEach((root) => root.style.setProperty('transition', 'margin-left .22s var(--ds-ease-in-out)', 'important'))
                     const next = { ...current, sidebarAutoHide: !wasAutoHide }
         current = next
         persist(next)
         instantSidebarExpand = false
         sidebarRevealed = !next.sidebarAutoHide
          if (wasAutoHide && revealedNow) {
            const pinSidebar = document.querySelector('[class*="sidebarCol"]')
            const pinRoot = pinSidebar && pinSidebar.querySelector('[data-slot="sidebar"] > [class*="root"]')
            // 「钉住」的语义是"原地冻结"：必须钉在侧栏列**当前**所在的框上。列在 Windows 下
            // 是从标题栏**下方**开始的（frame 有 padding-top: 标题栏高），原来写死的
            // `left/top:0; height:100%` 会把 root 提到视口左上角（z-index 900），它顶部那一行
            // ——deepseek 品牌行——就会盖到标题栏上闪一下。
            // 量的必须是未受动画影响的量：left/top/height 取列（列不参与 root 的滑入过渡），
            // width 取 root 自己。三个值都合理才钉，否则干脆不钉（正常过渡本来就安全）。
            const colRect = pinSidebar ? pinSidebar.getBoundingClientRect() : null
            const pinTop = colRect === null ? NaN : Math.round(colRect.top)
            const pinLeft = colRect === null ? NaN : Math.round(colRect.left)
            const pinHeight = colRect === null ? NaN : Math.round(colRect.height)
            if (pinRoot && pinHeight > 1 && Number.isFinite(pinTop) && Number.isFinite(pinLeft)) {
              // margin-left 只由 syncSidebarRoot 拥有：它不进快照，否则 360ms 后会把
              // 隐藏态的负偏移又还原回来（按钮已展开、侧栏却滑走了）。
              const names = ['position', 'left', 'top', 'width', 'height', 'z-index', 'transform', 'transition', 'will-change']
              const read = (el, list) => { const o = {}; list.forEach((n) => { o[n] = [el.style.getPropertyValue(n), el.style.getPropertyPriority(n)] }); return o }
              const snapRoot = read(pinRoot, names)
              const snapCol = read(pinSidebar, ['z-index'])
              const pw = Math.round(pinRoot.getBoundingClientRect().width) || sidebarWideWidth || 280
              pinSidebar.style.setProperty('z-index', '30', 'important')
              const rs = pinRoot.style
              rs.setProperty('position', 'fixed', 'important')
              rs.setProperty('left', pinLeft + 'px', 'important')
              rs.setProperty('top', pinTop + 'px', 'important')
              rs.setProperty('width', pw + 'px', 'important')
              rs.setProperty('height', pinHeight + 'px', 'important')
              rs.setProperty('z-index', '900', 'important')
              rs.setProperty('margin-left', '0', 'important')
              rs.setProperty('transform', 'none', 'important')
              rs.setProperty('transition', 'none', 'important')
              rs.setProperty('will-change', 'auto', 'important')
              if (sidebarPinTimer !== null) clearTimeout(sidebarPinTimer)
              sidebarPinTimer = setTimeout(() => {
                sidebarPinTimer = null
                const apply = (el, o) => { Object.entries(o).forEach(([n, [v, p]]) => v ? el.style.setProperty(n, v, p) : el.style.removeProperty(n)) }
                apply(pinRoot, snapRoot)
                apply(pinSidebar, snapCol)
              }, 360)
            }
          }
          if (!active) return
          // 起手要轻：只同步几何与属性，重活交给动画结束后的合并同步。
          // 原来这里同步跑 applyBackground（几十个 CSS 变量 + 主题 token + 全量查询）
          // 再跑 tagDom，第一次执行时正好压在过渡的第一帧上。
          enterMotion(340)
          applySidebarColumns(next)
          const frameNow = document.querySelector('[class*="frame"]')
          if (frameNow) {
            frameNow.setAttribute('data-dsh-auto-hide', String(!!next.sidebarAutoHide))
            syncFrameColumns(frameNow, !!next.sidebarAutoHide, sidebarWideWidth || 280, false)
          }
          scheduleSync()
       }
       window.addEventListener('pointerdown', sidebarToggleClick, true)
         window.addEventListener('mousedown', sidebarToggleClick, true)
         window.addEventListener('click', sidebarToggleClick, true)
        const onWindowResize = () => scheduleSync()
        window.addEventListener('resize', onWindowResize)
         document.addEventListener('click', sidebarToggleClick, true)

       // —— 合并同步（见文件顶部「动效预算」）——
       // 一次 DOM 变更批次只同步一次；动画窗口内直接推迟到动画结束。以前每个批次都同步跑
       // applyBackground + tagDom，正好压在滑入动画的每一帧上。
       let syncFrame = 0
       let syncTimer = null
       let syncPending = false
       const syncFrameNow = () => {
         const frameRoot = document.querySelector('[class*="frame"]')
         if (frameRoot) syncFrameColumns(frameRoot, !!current.sidebarAutoHide, sidebarWideWidth || 280, false)
       }
       // 拖拽分界线结束后再补一次同步：最后一帧官方可能刚写完 inline 宽度，而下一次
       // ResizeObserver 不会再触发（布局已稳定），补齐才能让插件按"最终宽度"重写轨道。
       const onPointerRelease = () => { if (active) scheduleSync() }
       document.addEventListener('pointerup', onPointerRelease, true)
       document.addEventListener('pointercancel', onPointerRelease, true)
       const deferSync = () => {
         if (syncTimer !== null) return
         const wait = Math.max(48, motionUntil - performance.now() + 48)
         syncTimer = setTimeout(() => { syncTimer = null; scheduleSync() }, wait)
       }
       const runSync = () => {
         syncFrame = 0
         if (!active) return
         if (motionActive()) { syncPending = true; deferSync(); return }
         syncPending = false
       applyBackground(current, theme); tagDom(); ensureLatestButton(); watchColumns(); measureLatestButton(conversationScrollElement); scheduleConversationScroll()
       }
       const scheduleSync = () => {
         if (syncFrame !== 0) return
         if (motionActive()) { syncPending = true; deferSync(); return }
         syncFrame = requestAnimationFrame(runSync)
       }
        // 串流期间 DOM 每秒要变几十次，而 applyBackground + tagDom 是"全文档查询 + 几十个
        // CSS 变量 + 主题 token"的重活，只为让新内容被标记到。把它去抖到安静期：转写越长，
        // 每次省下的越多，这正是"越用越卡"的来源。轻活（跟随最新、按钮位置）仍每帧做。
        const FULL_SYNC_DEBOUNCE_MS = 160
        let fullSyncTimer = null
        const scheduleFullSync = () => {
          if (fullSyncTimer !== null) return
          fullSyncTimer = setTimeout(() => { fullSyncTimer = null; if (active) scheduleSync() }, FULL_SYNC_DEBOUNCE_MS)
        }
        let lightSyncFrame = 0
        const scheduleLightSync = () => {
          if (lightSyncFrame !== 0) return
          lightSyncFrame = requestAnimationFrame(() => { lightSyncFrame = 0; if (active) scheduleConversationScroll() })
        }
       // 右栏（文档预览）滑动期间摘掉插件自己加的 backdrop-filter：官方面板本来是不透明的，
       // 毛玻璃是本插件加的，而它在「面板首次从屏幕外滑入」这一帧要新建整块 render surface，
       // 之后平移的每一帧还要按新背景重算模糊。摘掉后动画结束再淡回来（.16s）。
       const setPopupMotion = (on) => {
         try {
           if (on) document.documentElement.setAttribute('data-dsh-popup-motion', 'true')
           else document.documentElement.removeAttribute('data-dsh-popup-motion')
         } catch { /* 无 document 时必须安静 */ }
       }
       flushAfterMotion = () => { setPopupMotion(false); if (syncPending) scheduleSync() }
       // 放行容器过渡：第一次看到右栏真正展开（或 3s 都没打开过）时解除闸门。
       let popupAnimGateTimer = setTimeout(() => { popupAnimGateTimer = null; try { document.documentElement.removeAttribute('data-dsh-popup-anim') } catch { /* 忽略 */ } }, 3000)
       const openPopupAnimGate = () => {
         if (popupAnimGateTimer === null) return
         clearTimeout(popupAnimGateTimer)
         popupAnimGateTimer = null
         try { document.documentElement.removeAttribute('data-dsh-popup-anim') } catch { /* 忽略 */ }
       }
       // 只有"新增节点会改变插件标记目标"（切会话、换主面板、开右栏）才值得立刻全量同步；
        // 普通消息行与流式 delta 只走轻活 + 去抖全量。
        const STRUCTURAL_SELECTOR = '[data-phase], [data-conversation-scroll], [data-composer-seat], [data-sidebar-right-panel], [data-slot="main"]'
        const hasStructuralAddition = (records) => {
          for (const record of records) {
            if (record.type !== 'childList') continue
            for (const node of record.addedNodes) {
              if (node.nodeType !== 1) continue
              if (typeof node.matches === 'function' && node.matches(STRUCTURAL_SELECTOR)) return true
              if (typeof node.querySelector === 'function' && node.querySelector(STRUCTURAL_SELECTOR) !== null) return true
            }
          }
          return false
        }
        const mo = new MutationObserver((records) => {
          let immediate = false
          for (const record of records) {
            // 官方在"同一次提交"里既翻转 data-sidebar-right-open、又首次渲染 tab 内容
            // （iframe / Markdown 解析），所以它出现的那一刻就是动画的起手帧。
            if (record.type === 'attributes' && record.attributeName === 'hidden') {
              // 切换会话只翻 SessionView 的 hidden：右栏可见性变了但中心列宽度
              // 未必变，ResizeObserver 不会回调，这里必须主动重算一次轨道。
              syncFrameNow()
              immediate = true
              continue
            }
            if (record.type === 'attributes' && record.attributeName === 'data-sidebar-right-open') {
              openPopupAnimGate()
              enterMotion(420)
              setPopupMotion(true)
              syncFrameNow()
              immediate = true
            }
          }
          if (immediate || hasStructuralAddition(records)) scheduleSync()
          else scheduleFullSync()
          scheduleLightSync()
        })
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'data-variant', 'data-sidebar-right-open', 'hidden'] })
      // 0.1.5 的文档预览弹窗展开/收起会改 frame 的网格轨道（会话列随之收窄），而 React 只重写
      // inline grid-template-columns，不一定产生 childList 变更。用 ResizeObserver 盯住会话列
      // 宽度：宽度一变就立刻按官方轨道重排，弹窗弹出时会话区不会"慢半拍"。
      let columnObserver = null
      let columnTarget = null
      let columnFrame = 0
      const scheduleColumns = () => {
        if (columnFrame !== 0) return
        columnFrame = requestAnimationFrame(() => {
          columnFrame = 0
          if (!active) return
          // 只同步几何。这个回调在轨道动画期间是"每帧一次"，以前它调的是全量
          // applyBackground（几十个 CSS 变量 + 主题 token + 全量查询）——右栏滑入时
          // 每帧都要付一次全页样式重算，首次（缓存全冷）尤其贵。
          syncFrameNow()
        })
      }
      const watchColumns = () => {
        const center = document.querySelector('[class*="centerCol"]')
        if (center === columnTarget) return
        if (columnObserver !== null) { columnObserver.disconnect(); columnObserver = null }
        columnTarget = center
        if (center !== null && typeof ResizeObserver === 'function') {
          columnObserver = new ResizeObserver(scheduleColumns)
          columnObserver.observe(center)
        }
      }
      watchColumns()
      return () => { active = false; flushAfterMotion = null; setPopupMotion(false); document.querySelectorAll('[data-dsh-appearance-page]').forEach((el) => el.removeAttribute('data-dsh-appearance-page')); document.querySelectorAll('style[data-plugin-css="' + NS + ':page"]').forEach((el) => el.remove()); if (popupAnimGateTimer !== null) { clearTimeout(popupAnimGateTimer); popupAnimGateTimer = null; try { document.documentElement.removeAttribute('data-dsh-popup-anim') } catch { /* 忽略 */ } } if (prewarmTimer !== null) { clearTimeout(prewarmTimer); prewarmTimer = null } if (syncFrame !== 0) { cancelAnimationFrame(syncFrame); syncFrame = 0 } if (fullSyncTimer !== null) { clearTimeout(fullSyncTimer); fullSyncTimer = null } if (lightSyncFrame !== 0) { cancelAnimationFrame(lightSyncFrame); lightSyncFrame = 0 } if (syncTimer !== null) { clearTimeout(syncTimer); syncTimer = null } if (sidebarHoverFrame !== 0) { cancelAnimationFrame(sidebarHoverFrame); sidebarHoverFrame = 0 } if (motionTimer !== null) { clearTimeout(motionTimer); motionTimer = null } motionUntil = 0; if (columnObserver !== null) { columnObserver.disconnect(); columnObserver = null } if (columnFrame !== 0) { cancelAnimationFrame(columnFrame); columnFrame = 0 } if (bootTimer !== null && bootTimer !== undefined) { clearTimeout(bootTimer); bootTimer = null } if (persistTimer !== null && persistTimer !== undefined) { clearTimeout(persistTimer); persistTimer = null } if (sidebarPinTimer !== null) { clearTimeout(sidebarPinTimer); sidebarPinTimer = null } cancelAnimationFrame(frame); cancelAnimationFrame(conversationScrollFrame); if (conversationScrollElement && conversationScrollListener) conversationScrollElement.removeEventListener('scroll', conversationScrollListener); if (conversationScrollHost && conversationScrollHostPosition !== null) { if (conversationScrollHostPosition[0]) conversationScrollHost.style.setProperty('position', conversationScrollHostPosition[0], conversationScrollHostPosition[1]); else conversationScrollHost.style.removeProperty('position') } cancelAnimationFrame(sidebarRestoreFrame); window.removeEventListener('pointerdown', sidebarToggleClick, true); window.removeEventListener('mousedown', sidebarToggleClick, true); window.removeEventListener('click', sidebarToggleClick, true); document.removeEventListener('click', sidebarToggleClick, true); window.removeEventListener('resize', onWindowResize); document.removeEventListener('mousemove', move); document.removeEventListener('mousemove', sidebarHover); document.removeEventListener('pointerup', onPointerRelease, true); document.removeEventListener('pointercancel', onPointerRelease, true); mo.disconnect(); sidebarStyleElements.forEach((sidebar) => restoreStyle(sidebarStyleState, sidebar)); sidebarStyleElements.clear(); sidebarRootStyleElements.forEach((root) => restoreStyle(sidebarRootStyleState, root)); sidebarRootStyleElements.clear(); document.querySelectorAll('[class*="frame"]').forEach((frameRoot) => restoreStyle(frameStyleState, frameRoot)); document.querySelectorAll('.dsh-appearance-wash, .dsh-appearance-bg').forEach((el) => el.remove()); document.querySelectorAll('#dsh-ui-appearance-bg-css').forEach((el) => el.remove()); document.querySelectorAll('[data-dsh-appearance-composer]').forEach((el) => el.removeAttribute('data-dsh-appearance-composer')); document.querySelectorAll('[data-dsh-appearance-session], [data-dsh-appearance-seat]').forEach((el) => { el.removeAttribute('data-dsh-appearance-session'); el.removeAttribute('data-dsh-appearance-seat') }); if (preloadProbe) { preloadProbe.onload = null; preloadProbe.onerror = null; preloadProbe = null } if (preloadTimeout !== null) { clearTimeout(preloadTimeout); preloadTimeout = null } if (latestButton?.isConnected) latestButton.remove(); latestButton = null; appearanceThemeDisposer?.(); appearanceThemeDisposer = null; document.getElementById('dsh-ui-appearance-bg-css')?.remove(); if (preloadTag?.isConnected && document.getElementById('dsh-ui-appearance-preload') === preloadTag) preloadTag.remove(); appearanceRootStyles.forEach(([value, priority, appliedValue], name) => { const currentValue = document.documentElement.style.getPropertyValue(name); if (currentValue === appliedValue) { if (value) document.documentElement.style.setProperty(name, value, priority); else document.documentElement.style.removeProperty(name) } }); appearanceRootStyles.clear(); appearanceRootStyles.clear(); document.documentElement.removeAttribute('data-dsh-popup-sync'); document.documentElement.style.removeProperty('--dsh-rightbar-track'); tag.remove(); popupTag.remove(); bg.remove() }
    }, 'dsh-ui-appearance: shell')
    // DSH 0.1.2 起 primitives 的 Tooltip 气泡不再 portal 到 document.body（0.1.1 是
    // createPortal 到 body），但它仍是 position:fixed；本插件给会话卡片/输入框/设置面板
    // 加了 backdrop-filter，这些卡片因此成为 fixed 元素的包含块，气泡会按卡片左上角定位，
    // 视觉上飞出很远。
    // 做法：气泡一进 DOM 就找出最近的"包含块祖先"，把它的视口原点从气泡的 left/top 里扣掉。
    // 量的是祖先的 rect，所以不受气泡自身入场动画影响；补偿值记在气泡的 data 属性上，
    // 重复扫描（包括插件的多个实例）不会叠加，也不会形成"改样式 → 再次触发观察者"的死循环。
    ctx.effect(() => {
      const FIX_ATTR = 'data-dsh-tooltip-fix'
      const createsContainingBlock = (style) => (
        style.transform !== 'none'
        || style.filter !== 'none'
        || style.backdropFilter !== 'none'
        || style.perspective !== 'none'
        || style.willChange.includes('transform')
        || style.willChange.includes('filter')
        || style.willChange.includes('perspective')
        || /paint|layout|strict|content/.test(style.contain)
      )
      // fixed 元素的包含块是那个祖先的 padding box，而 getBoundingClientRect 给的是 border box。
      const originOf = (bubble) => {
        let element = bubble.parentElement
        while (element !== null && element !== document.documentElement) {
          const style = getComputedStyle(element)
          if (createsContainingBlock(style)) {
            const rect = element.getBoundingClientRect()
            return {
              x: rect.left + (parseFloat(style.borderLeftWidth) || 0),
              y: rect.top + (parseFloat(style.borderTopWidth) || 0),
            }
          }
          element = element.parentElement
        }
        return null
      }
      const align = (bubble) => {
        if (!(bubble instanceof HTMLElement) || bubble.getAttribute('role') !== 'tooltip') return
        const left = bubble.style.left
        const top = bubble.style.top
        if (left === '' || top === '') return
        // 当前值就是我们上次写下的补偿值 → 已经处理过，别再来一次。
        const fixed = bubble.getAttribute(FIX_ATTR)
        if (fixed !== null) {
          const separator = fixed.indexOf('|')
          if (fixed.slice(0, separator) === left && fixed.slice(separator + 1) === top) return
        }
        const origin = originOf(bubble)
        if (origin === null) return
        const x = parseFloat(left)
        const y = parseFloat(top)
        if (!Number.isFinite(x) || !Number.isFinite(y)) return
        const nextLeft = `${x - origin.x}px`
        const nextTop = `${y - origin.y}px`
        if (nextLeft === left && nextTop === top) return
        bubble.setAttribute(FIX_ATTR, `${nextLeft}|${nextTop}`)
        bubble.style.left = nextLeft
        bubble.style.top = nextTop
      }
      const scan = () => document.querySelectorAll('[role="tooltip"]').forEach(align)
      // 观察者回调只做合并调度：一帧最多补一次，避免连续改样式时反复扫描。
      let frame = 0
      const schedule = () => {
        if (frame !== 0) return
        frame = requestAnimationFrame(() => { frame = 0; scan() })
      }
      // 只在这批变更真的涉及 tooltip 时才扫描：原来每次 DOM 变化都 querySelectorAll
      // 一遍全文档，转写越长越贵，而 tooltip 出现/移动本身是低频事件。
      const involvesTooltip = (records) => {
        for (const record of records) {
          if (record.type === 'attributes') {
            const target = record.target
            if (target && typeof target.getAttribute === 'function' && target.getAttribute('role') === 'tooltip') return true
            continue
          }
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1) continue
            if (typeof node.getAttribute === 'function' && node.getAttribute('role') === 'tooltip') return true
            if (typeof node.querySelector === 'function' && node.querySelector('[role="tooltip"]') !== null) return true
          }
        }
        return false
      }
      const observer = new MutationObserver((records) => { if (involvesTooltip(records)) schedule() })
      if (document.body !== null) observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })
      window.addEventListener('resize', schedule)
      schedule()
      return () => {
        observer.disconnect()
        window.removeEventListener('resize', schedule)
        if (frame !== 0) cancelAnimationFrame(frame)
      }
    }, 'dsh-ui-appearance: tooltip offset')
    // 桌面端（Electron）默认拒绝一切权限，包括 clipboard-sanitized-write，
    // navigator.clipboard.writeText 会抛 NotAllowedError；而 DSH 的 writeClipboard 在
    // "异步 API 存在但抛错"时不会退回 execCommand，复制按钮于是毫无反应。
    // 桌面端 preload 已暴露走 IPC 的原生剪贴板（window.dshDesktopClipboard），这里优先用它，
    // 失败再退回浏览器 API。Web 端没有这个桥，effect 直接返回，行为不变。
    // DSH 0.2.0 换成了 window.dshDesktop（且不含剪贴板写入器），这个桥已不存在，本 effect 在
    // 桌面端因此变成空转——客户端自己的 writeClipboard 现在自带 execCommand 回退，功能不受影响。
    // 整段包在 try 里：任何环境差异都不允许影响插件加载。
    ctx.effect(() => {
      try {
        const bridge = window.dshDesktopClipboard
        if (bridge === undefined || typeof bridge.writeText !== 'function') return
        const clipboard = navigator.clipboard
        if (clipboard === undefined || typeof clipboard.writeText !== 'function') return
        const original = clipboard.writeText
        const hadOwnWriteText = Object.prototype.hasOwnProperty.call(clipboard, 'writeText')
        // 多个实例（HMR 重载）会串起来包装，链上每一环都记住最原始的实现，
        // 这样卸载链头时还原到最初版本，而不是还原成上一个包装。
        const root = typeof original.dshClipboardRoot === 'function' ? original.dshClipboardRoot : original
        const patched = (text) => Promise.resolve()
          .then(() => bridge.writeText(String(text)))
          .then(() => undefined)
          .catch(() => Promise.resolve(original.call(clipboard, text)).then(() => undefined))
        patched.dshClipboardRoot = root
        Object.defineProperty(clipboard, 'writeText', { value: patched, configurable: true, writable: true })
        // 浏览器里 writeText 在 Clipboard.prototype 上，delete 就能还原；
        // 若运行环境把它放在实例自身上，则写回原函数。
        // 卸载时只在"自己仍是链头"时还原，否则会把更新实例的补丁一起删掉。
        return () => {
          try {
            if (clipboard.writeText !== patched) return
            if (hadOwnWriteText) Object.defineProperty(clipboard, 'writeText', { value: root, configurable: true, writable: true })
            else delete clipboard.writeText
          } catch (error) { /* 还原失败不影响卸载 */ }
        }
      } catch (error) { return }
    }, 'dsh-ui-appearance: clipboard fallback')
    ctx.effect(() => slots.inject('settings.section', () => slots.register({ name: 'settings.section', id: NS, order: 90, label: '外观' }, Panel)))
    }
  module.exports = { name: NS, inject: ['slots', 'theme'], apply }
  return module.exports
  }
})

