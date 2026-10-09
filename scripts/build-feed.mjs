// 前沿雷达 · 生成 RSS 订阅源
//
// 用法：node scripts/build-feed.mjs
// 输出：feed.xml（仓库根目录 → 线上 https://zc040315.github.io/frontier-radar/feed.xml）
//
// 为什么要有这个：这个站的定位是「替代算法推荐的信息源」，但没有订阅入口的话，
// 你只能靠「想起来才打开」——那它就不是信息源，是一个备忘录。
//
// 订阅源里放两类内容，按时间倒序混排：
//   正式条目 —— 策展过的，正文（what / why / 站内正文）全部写进条目里
//   每日线索 —— 未经策展的原文摘要，同样写在条目里，在阅读器里就能读完
// 也就是说：不点开网站也能读完，点开只是为了看地图和分类。
//
// 每次跑完 fetch-daily.mjs 之后由 GitHub Actions 自动调用（见 .github/workflows/daily.yml）。

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve(import.meta.dirname, '..')
const SITE = 'https://zc040315.github.io/frontier-radar'
const OUT = path.join(ROOT, 'feed.xml')

// 正式条目更新慢、每日线索更新快，分开限量，免得一方把另一方挤掉
const MAX_CURATED = 15
// 每日线索一天能出 20 多条（arXiv + bioRxiv + medRxiv 都是日更），
// 放太多会把正式条目挤到订阅源最底下——阅读器一般只显示最新若干条。
const MAX_DAILY = 20

function load(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
  const sandbox = { window: {} }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox, { filename: file })
  return sandbox.window
}

const DATA = load('data/items.js').FRONTIER_DATA
const BODIES = load('data/bodies.js').FRONTIER_BODIES || {}
const DAILY = load('data/daily.js').FRONTIER_DAILY || { items: [] }

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const rfc822 = (d) => {
  const t = new Date(d)
  return isNaN(t.getTime()) ? new Date().toUTCString() : t.toUTCString()
}

const domainLabel = Object.fromEntries(DATA.domains.map((d) => [d.id, d.label]))
const entries = []

// ---------- 正式条目 ----------
for (const it of DATA.items.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, MAX_CURATED)) {
  const parts = []
  parts.push(`<p><strong>一句话是什么：</strong>${esc(it.what)}</p>`)
  parts.push(`<p><strong>为什么值得你知道：</strong>${esc(it.why)}</p>`)
  const body = BODIES[it.id]
  if (body && body.length) {
    for (const s of body) parts.push(`<h4>${esc(s.h)}</h4><p>${esc(s.p)}</p>`)
  }
  parts.push(
    `<p>一手来源：<a href="${esc(it.link)}">${esc(it.org)}</a> · ` +
      `站内打开：<a href="${SITE}/#item-${esc(it.id)}">${SITE.replace(/^https?:\/\//, '')}/#item-${esc(it.id)}</a></p>`
  )
  // 关键：正式条目按「入库时间」排序，不按论文发表日期。
  // 否则 2017 年的 Transformer 会被排到订阅源最末尾，
  // 阅读器只显示最新 N 条时就永远看不到它。
  const addedAt = it.added || it.date
  if (addedAt !== it.date) parts.push(`<p>原文发表于 ${esc(it.date)}，${esc(addedAt)} 收录进本站。</p>`)
  entries.push({
    title: it.titleZh,
    link: `${SITE}/#item-${it.id}`,
    guid: `curated-${it.id}`,
    date: addedAt,
    category: domainLabel[it.domain] || it.domain,
    html: parts.join('\n'),
  })
}

// ---------- 每日线索 ----------
// 线索按「发布时间」排——它们本身就是当天的内容，两个时间是一回事
for (const d of DAILY.items.slice().sort((a, b) => (a.published < b.published ? 1 : -1)).slice(0, MAX_DAILY)) {
  const parts = []
  if (d.summary) parts.push(`<p>${esc(d.summary)}</p>`)
  parts.push(
    `<p>${esc(d.source)} · ${d.sourceType === 'academic' ? '学术一手' : '官方一手'} · ` +
      `<a href="${esc(d.url)}">原文出处</a></p>`
  )
  parts.push(`<p><a href="${SITE}/daily.html">在站内看全部每日线索 →</a></p>`)
  entries.push({
    title: d.title,
    link: d.url,
    guid: d.id,
    date: d.published,
    category: domainLabel[d.domain] || d.domain,
    html: parts.join('\n'),
  })
}

entries.sort((a, b) => new Date(b.date) - new Date(a.date))

const now = DAILY.generatedAt || new Date().toISOString()
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>前沿雷达</title>
    <link>${SITE}/</link>
    <description>由我自己策展的前沿科技信息源。只收一手来源（学术一手 + 官方一手），不收媒体转载。订阅源里有两类条目：带解读的「正式条目」，和只有原文摘要的「每日线索」——正文都直接写在条目里，不点开网站也能读完。</description>
    <language>zh-CN</language>
    <lastBuildDate>${rfc822(now)}</lastBuildDate>
    <generator>前沿雷达 · scripts/build-feed.mjs</generator>
    <!-- 本次共 ${entries.length} 条：正式条目最多 ${MAX_CURATED}，每日线索最多 ${MAX_DAILY} -->
${entries
  .map(
    (e) => `    <item>
      <title>${esc(e.title)}</title>
      <link>${esc(e.link)}</link>
      <guid isPermaLink="false">${esc(e.guid)}</guid>
      <pubDate>${rfc822(e.date)}</pubDate>
      <category>${esc(e.category)}</category>
      <description>${esc(e.html)}</description>
    </item>`
  )
  .join('\n')}
  </channel>
</rss>
`

fs.writeFileSync(OUT, xml)
const curated = entries.length - Math.min(DAILY.items.length, MAX_DAILY)
console.log(
  `写入 feed.xml：${entries.length} 条（正式条目 ${curated} / 每日线索 ${Math.min(DAILY.items.length, MAX_DAILY)}），` +
    `${(Buffer.byteLength(xml) / 1024).toFixed(0)} KB`
)
