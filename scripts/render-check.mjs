// 前沿雷达 · 渲染自检
//
// 数据自检（scripts/check-data.mjs）只看字段对不对，看不出页面是不是坏了。
// 这个脚本负责另一半：真的用浏览器把页面渲染出来，量几何、抓控制台报错、
// 试一次「点标题展开全文」，顺手出几张截图。
//
// 用法：node scripts/render-check.mjs [--out=目录] [--shot]
//   默认截图写到系统临时目录，不会污染仓库；加 --shot 才截图。
//   需要本机装了 Chrome 或 Edge（脚本会自己找），不需要 npm 安装任何东西。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=?(.*)$/.exec(a)
    return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true]
  })
)

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = args.out ? path.resolve(String(args.out)) : path.join(os.tmpdir(), 'frontier-radar-qa')
const WANT_SHOTS = Boolean(args.shot)

const PAGES = [
  { file: 'index.html', name: 'index' },
  // 详情面板是「站内正文」真正呈现的地方，靠 hash 直接打开来验证
  { file: 'index.html', name: 'panel', hash: '#item-alphafold3' },
  { file: 'daily.html', name: 'daily' },
  { file: 'map.html', name: 'map' },
  { file: 'categories.html', name: 'categories' },
  { file: 'about.html', name: 'about' },
]
const VIEWPORTS = [
  { w: 1600, h: 1000, label: 'desktop' },
  { w: 430, h: 900, label: 'mobile' },
]

// ---------- 找浏览器 ----------

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

const BROWSER = CANDIDATES.find((p) => {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
})

if (!BROWSER) {
  console.error('找不到 Chrome / Edge。可以设环境变量 CHROME_PATH 指向浏览器可执行文件。')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 启动浏览器 ----------

const PORT = 9400 + Math.floor(Math.random() * 200)
const CDP = `http://127.0.0.1:${PORT}`
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-render-'))

const child = spawn(
  BROWSER,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-software-rasterizer',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
)

let up = false
for (let i = 0; i < 40; i++) {
  await sleep(400)
  try {
    const r = await fetch(`${CDP}/json/version`)
    if (r.ok) {
      up = true
      break
    }
  } catch {
    /* 还没起来 */
  }
}

if (!up) {
  child.kill()
  console.error('浏览器没能在 16 秒内启动调试端口，放弃。')
  process.exit(1)
}

// ---------- 探测脚本 ----------

const PROBE = `(() => {
  const px = (v) => Math.round(v * 10) / 10;
  const de = document.documentElement;
  const o = {};
  o.hOverflow = de.scrollWidth - de.clientWidth;
  o.pageHeight = de.scrollHeight;
  o.rows = document.querySelectorAll(".row").length;
  o.dailyRows = document.querySelectorAll(".daily-row").length;
  o.nodes = document.querySelectorAll(".node").length;
  o.nodeItems = document.querySelectorAll(".node-items li").length;
  o.catCards = document.querySelectorAll(".cat-card").length;
  // 横向越界的元素：这类问题在截图里往往看不出来，但手机上会抖动
  const off = [];
  // 两类「越界」是设计本身要的，不算问题：
  //   1. 关闭状态的详情面板停在视口右侧外面，等着滑进来；
  //   2. 类别 chips 放在横向滚动条里，宽出去才能滑。
  const intentional = (n) => {
    for (let p = n; p && p !== document.body; p = p.parentElement) {
      if (p.classList && (p.classList.contains("panel") || p.classList.contains("panel-sheet"))) return true;
      const cs = getComputedStyle(p);
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && p.scrollWidth > p.clientWidth + 2) return true;
    }
    return false;
  };
  document.querySelectorAll("body *").forEach((n) => {
    const r = n.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (intentional(n)) return;
    if (r.right > de.clientWidth + 1.5 || r.left < -1.5) {
      off.push((n.className || n.tagName) + "[" + Math.round(r.left) + "," + Math.round(r.right) + "]");
    }
  });
  o.hOffenders = off.slice(0, 8);
  o.hasBodies = typeof window.FRONTIER_BODIES === "object" && window.FRONTIER_BODIES !== null;
  o.bodyCount = o.hasBodies ? Object.keys(window.FRONTIER_BODIES).length : 0;
  o.readBadges = document.querySelectorAll(".side-read").length;
  const panel = document.getElementById("panel");
  o.panelOpen = Boolean(panel && panel.classList.contains("is-open"));
  o.readSections = document.querySelectorAll(".read-section").length;
  o.readSource = Boolean(document.querySelector(".read-source"));
  return o;
})()`

// 每日线索的展开/收拢是不是真的能用（这是「站内读完」的核心交互）
const EXPAND_TEST = `(() => {
  const toggles = Array.from(document.querySelectorAll(".daily-toggle"));
  if (!toggles.length) return { skipped: "没有 .daily-toggle" };
  // 摘要有长有短，短的本来就不需要展开，所以要找第一条「真能展开」的来试
  const toggle = toggles.find((t) => t.parentElement.querySelector(".daily-summary--full"));
  if (!toggle) return { skipped: toggles.length + " 条线索的摘要都不够长，没有展开项" };
  const preview = toggle.parentElement.querySelector(".daily-summary:not(.daily-summary--full)");
  const full = toggle.parentElement.querySelector(".daily-summary--full");
  const before = { expanded: toggle.getAttribute("aria-expanded"), previewHidden: preview.hidden, fullHidden: full.hidden };
  toggle.click();
  const after = { expanded: toggle.getAttribute("aria-expanded"), previewHidden: preview.hidden, fullHidden: full.hidden };
  const fullVisible = full.offsetParent !== null && !full.hidden;
  const previewGone = preview.hidden || preview.offsetParent === null;
  toggle.click();
  const closed = { expanded: toggle.getAttribute("aria-expanded"), previewHidden: preview.hidden, fullHidden: full.hidden };
  // 验证完再展开一次并留在展开态：截图要能证明「站内真的读得完」
  toggle.click();
  return { before, after, fullVisible, previewGone, closed, ok: fullVisible && previewGone && closed.previewHidden === false };
})()`

// 搜索必须能搜到「站内正文」里的词。
// 「Virchow」只出现在 pathfm 这一条的正文里（items.js 里 0 次），
// 所以它是验证正文有没有进搜索索引的干净测试词。
const SEARCH_TEST = `(() => {
  const input = document.getElementById("search");
  const feed = document.getElementById("feed");
  if (!input || !feed) return { skipped: "没有搜索框" };
  const count = () => feed.querySelectorAll(".row").length;
  const fire = (v) => {
    input.value = v;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const before = count();
  fire("Virchow");
  const hitRows = count();
  const firstTitle = feed.querySelector(".row-title") ? feed.querySelector(".row-title").textContent : "";
  fire("ZZQQXX肯定搜不到");
  const emptyRows = count();
  fire("");
  const restored = count();
  return { before, hitRows, firstTitle, emptyRows, restored, ok: hitRows === 1 && emptyRows === 0 && restored === before };
})()`

async function connect(target) {
  const ws = new WebSocket(target)
  let seq = 0
  const pending = new Map()
  const logs = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      logs.push('异常：' + (d.exception?.description || d.text || '').split('\n')[0].slice(0, 160))
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      logs.push('console.error：' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160))
    }
  })
  await new Promise((res) => ws.addEventListener('open', res, { once: true }))
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, (m) => (m.error ? reject(new Error(method + ' ' + JSON.stringify(m.error))) : resolve(m.result)))
      ws.send(JSON.stringify({ id, method, params }))
    })
  return { ws, send, logs }
}

async function run() {
  const problems = []
  const report = []
  let shots = 0

  for (const page of PAGES) {
    const file = path.join(ROOT, page.file)
    if (!fs.existsSync(file)) {
      problems.push(`${page.file} 不存在`)
      continue
    }
    for (const vp of VIEWPORTS) {
      const created = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
      const { send, logs } = await connect(created.webSocketDebuggerUrl)
      try {
        await send('Page.enable')
        await send('Runtime.enable')
        await send('Emulation.setDeviceMetricsOverride', {
          width: vp.w,
          height: vp.h,
          deviceScaleFactor: 1,
          mobile: vp.w < 700,
        })
        await send('Page.navigate', { url: pathToFileURL(file).href + (page.hash || '') })
        await sleep(1200)

        const probe = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true })
        const m = probe.result.value || {}
        let expand = null
        if (page.name === 'index' || page.name === 'daily') {
          const e = await send('Runtime.evaluate', { expression: EXPAND_TEST, returnByValue: true })
          expand = e.result.value
        }
        let search = null
        if (page.name === 'index' && vp.label === 'desktop') {
          const s = await send('Runtime.evaluate', { expression: SEARCH_TEST, returnByValue: true })
          search = s.result.value
        }

        const line = `${page.name}/${vp.label}: 溢出 ${m.hOverflow}px · 高度 ${m.pageHeight} · 条目 ${m.rows} · 每日 ${m.dailyRows} · 节点 ${m.nodes} · 类别卡 ${m.catCards} · 正文 ${m.bodyCount}`
        report.push(line)

        if (m.hOverflow > 0) problems.push(`${page.name}/${vp.label} 横向溢出 ${m.hOverflow}px`)
        if (m.hOffenders && m.hOffenders.length) problems.push(`${page.name}/${vp.label} 元素越界：${m.hOffenders.join(' ')}`)
        if (page.name === 'index' && vp.label === 'desktop' && !m.rows) problems.push('首页没有渲染出条目')
        if (page.name === 'daily' && !m.dailyRows) problems.push('每日页没有渲染出线索')
        if (page.name === 'map' && !m.nodes) problems.push('地图页没有渲染出节点')
        if (page.name === 'categories' && !m.catCards) problems.push('分类页没有渲染出类别卡')
        if (page.name === 'index' && !m.readBadges) problems.push('首页没有任何「站内正文」标记（bodies.js 可能没加载）')
        if (page.name === 'panel' && !m.panelOpen) problems.push('panel：详情面板没有打开（hash 路由可能失效）')
        if (page.name === 'panel' && m.readSections < 3) problems.push(`panel：站内正文只渲染出 ${m.readSections} 个小节`)
        if (page.name === 'panel' && !m.readSource) problems.push('panel：站内正文末尾缺「一手来源」说明')
        logs.forEach((l) => problems.push(`${page.name}/${vp.label} ${l}`))

        if (expand && !expand.ok && !expand.skipped) {
          problems.push(`${page.name}/${vp.label} 展开全文不可用：${JSON.stringify(expand)}`)
        }
        if (expand && !expand.skipped) {
          report.push(`  └ 展开全文：点击后全文可见 ${expand.fullVisible} · 预览已收起 ${expand.previewGone} · 再点收拢正常 ${expand.closed.previewHidden === false}`)
        }
        if (search && !search.skipped) {
          report.push(
            `  └ 搜索含正文：搜「Virchow」命中 ${search.hitRows} 条（${String(search.firstTitle).slice(0, 18)}）` +
              ` · 无关词命中 ${search.emptyRows} 条 · 清空后恢复 ${search.restored} 条`
          )
          if (!search.ok) problems.push(`搜索行为异常：${JSON.stringify(search)}`)
        }

        if (WANT_SHOTS) {
          fs.mkdirSync(OUT, { recursive: true })
          const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
          const out = path.join(OUT, `${page.name}-${vp.label}.png`)
          fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
          shots++
        }
      } catch (e) {
        problems.push(`${page.name}/${vp.label} 探测失败：${e.message}`)
      } finally {
        try {
          await fetch(`${CDP}/json/close/${created.id}`)
        } catch {
          /* 关不掉就算了 */
        }
      }
    }
  }

  console.log('渲染自检：')
  report.forEach((r) => console.log('  ' + r))
  if (WANT_SHOTS) console.log(`\n截图 ${shots} 张 → ${OUT}`)

  if (problems.length) {
    console.log('\n问题：')
    problems.forEach((p) => console.log('  ✗ ' + p))
    return 1
  }
  console.log('\n渲染自检通过 ✓')
  return 0
}

let code = 1
try {
  code = await run()
} catch (e) {
  console.error('自检本身出错：', e)
} finally {
  child.kill()
  await sleep(300)
  try {
    fs.rmSync(profile, { recursive: true, force: true })
  } catch {
    /* Windows 上偶尔删不掉，不影响结果 */
  }
}
process.exit(code)
