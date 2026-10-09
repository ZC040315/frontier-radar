// 前沿雷达 · 把一条「每日线索」升格成「正式条目」草稿
//
// 为什么要有它：README 里写着「觉得哪条值得留下，就按模板写成正式条目」，
// 但真实动作是「打开网站 → 记住标题 → 打开编辑器 → 手打十几个字段」。
// 这个摩擦决定了那件事不会发生——线索池会一直长，正式条目停在 48 条。
// 这个脚本把能从线索里直接推出来的字段全填好，只把需要人判断的留空。
//
// 用法：
//   node scripts/promote.mjs                     列出最近的线索（带 id）
//   node scripts/promote.mjs d-1a2b3c4d          按 id 生成草稿并写入 items.js
//   node scripts/promote.mjs transformer         按标题关键词匹配（唯一命中才继续）
//   node scripts/promote.mjs d-1a2b3c4d --dry    只打印草稿，不写文件
//
// 它填好什么：链接、原标题、日期、领域、类别、类型、入库日期
// 它留给你什么：中文标题、机构、【一句话是什么】、【为什么值得你知道】
//              ——最后那两个是本站在别处抄不到的东西，必须自己写
//
// 写入前会先解析一遍生成结果，解析不通过就一个字都不写。

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve(import.meta.dirname, '..')
const ITEMS_FILE = path.join(ROOT, 'data', 'items.js')
const DAILY_FILE = path.join(ROOT, 'data', 'daily.js')
const MARK = '【待填】'

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const KEY = argv.filter((a) => !a.startsWith('--'))[0]

function load(file) {
  const src = fs.readFileSync(file, 'utf8')
  const sandbox = { window: {} }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox, { filename: path.basename(file) })
  return sandbox.window
}

// 链接的唯一键：协议和末尾斜杠都不参与，避免 http / https 被当成两条
function linkKey(u) {
  try {
    const x = new URL(u)
    return (x.host + x.pathname).replace(/\/$/, '')
  } catch {
    return String(u || '').trim()
  }
}

const DATA = load(ITEMS_FILE).FRONTIER_DATA
const DAILY = load(DAILY_FILE).FRONTIER_DAILY || { items: [] }
const leads = DAILY.items || []

const domainLabel = Object.fromEntries(DATA.domains.map((d) => [d.id, d.label]))
const categoryLabel = Object.fromEntries(load(path.join(ROOT, 'data', 'categories.js')).FRONTIER_CATEGORIES.map((c) => [c.id, c.label]))

// ---------- 不带参数：列出线索 ----------
if (!KEY) {
  if (!leads.length) {
    console.log('还没有每日线索。先跑 node scripts/fetch-daily.mjs')
    process.exit(0)
  }
  console.log(`最近 ${Math.min(leads.length, 20)} 条每日线索（共 ${leads.length} 条）：\n`)
  leads.slice(0, 20).forEach((l) => {
    const d = String(l.published).slice(0, 10)
    console.log(`  ${l.id}  ${d}  ${(domainLabel[l.domain] || l.domain).padEnd(8)} ${String(l.source).padEnd(18)}`)
    console.log(`      ${l.title.slice(0, 76)}${l.title.length > 76 ? '…' : ''}`)
  })
  console.log('\n用 node scripts/promote.mjs <id> 生成草稿（也可以直接给标题里的关键词）')
  process.exit(0)
}

// ---------- 找那条线索 ----------
let lead = leads.find((l) => l.id === KEY)
if (!lead) {
  const hits = leads.filter((l) => String(l.title).toLowerCase().includes(KEY.toLowerCase()))
  if (hits.length === 1) lead = hits[0]
  else if (hits.length === 0) {
    console.log(`没找到匹配「${KEY}」的线索。用 node scripts/promote.mjs 看看有哪些。`)
    process.exit(1)
  } else {
    console.log(`「${KEY}」匹配到 ${hits.length} 条，请用 id 指定：\n`)
    hits.forEach((h) => console.log(`  ${h.id}  ${h.title.slice(0, 70)}`))
    process.exit(1)
  }
}

// ---------- 重复检查 ----------
const dup = DATA.items.find((i) => linkKey(i.link) === linkKey(lead.url))
if (dup) {
  console.log(`这条已经在正式条目里了：${dup.id}（${dup.titleZh}）`)
  process.exit(1)
}

// ---------- 能从线索推出来的字段 ----------
const existing = new Set(DATA.items.map((i) => i.id))

function slugFrom(title) {
  const STOP = new Set([
    'a', 'an', 'the', 'of', 'for', 'and', 'on', 'in', 'to', 'with', 'via', 'is', 'are',
    'by', 'from', 'at', 'as', 'using', 'towards', 'toward', 'new', 'deep', 'how', 'what',
  ])
  const words = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
  let s = words.slice(0, 4).join('-')
  if (s.length > 40) s = s.slice(0, 40).replace(/-$/, '')
  return s || 'item'
}

let id = slugFrom(lead.title)
if (existing.has(id)) {
  let n = 2
  while (existing.has(`${id}-${n}`)) n += 1
  id = `${id}-${n}`
}

const published = new Date(lead.published)
const date = isNaN(published.getTime())
  ? new Date().toISOString().slice(0, 10)
  : published.toISOString().slice(0, 10)

// toLocaleDateString('sv-SE') 给你本地的 YYYY-MM-DD
const today = new Date().toLocaleDateString('sv-SE')

const type = lead.kind === 'paper' ? 'paper' : 'product'
const isArxiv = /^arXiv/i.test(lead.source)
const org = isArxiv ? `${MARK}机构（线索来自 ${lead.source}，去原文看作者单位）` : lead.source

const item = {
  id,
  titleZh: `${MARK}中文标题`,
  titleOrig: lead.title,
  type,
  domain: lead.domain,
  layer: 'trunk',
  category: lead.category,
  date,
  org,
  what: `${MARK}一句话是什么`,
  why: `${MARK}为什么值得你知道`,
  tags: [],
  link: lead.url,
  related: [],
  added: today,
}

const snippet =
  '  // 由 scripts/promote.mjs 从每日线索生成，待补齐【待填】字段\n' +
  '  ' +
  JSON.stringify(item, null, 2)
    // items.js 的写法是键不带引号，跟它保持一致
    .replace(/^(\s*)"([A-Za-z_][A-Za-z0-9_]*)":/gm, '$1$2:')
    .split('\n')
    .join('\n  ')

if (DRY) {
  console.log('（--dry：只打印，不写入）\n')
  console.log(snippet)
  process.exit(0)
}

// ---------- 写入：先验证，再落盘 ----------
const src = fs.readFileSync(ITEMS_FILE, 'utf8')
const anchor = '\n  ]\n};'
const at = src.lastIndexOf(anchor)
if (at === -1) {
  console.log('items.js 的结构和预期不一样（找不到结尾的 "  ]\\n};"），为安全起见没有改动任何文件。')
  process.exit(1)
}
const next = src.slice(0, at) + ',\n' + snippet + src.slice(at)

const sandbox = { window: {} }
vm.createContext(sandbox)
try {
  vm.runInContext(next, sandbox, { filename: 'items.js' })
} catch (e) {
  console.log('生成的代码解析失败，已放弃写入：' + e.message)
  process.exit(1)
}
const after = sandbox.window.FRONTIER_DATA
if (!after || after.items.length !== DATA.items.length + 1) {
  console.log('生成的条目数不对，已放弃写入。')
  process.exit(1)
}

fs.writeFileSync(ITEMS_FILE, next)

// ---------- 告诉人还剩什么 ----------
console.log(`已写入 data/items.js：${id}`)
console.log(`  ${lead.title.slice(0, 70)}${lead.title.length > 70 ? '…' : ''}`)
console.log('')
console.log('已自动填好：链接、原标题、日期、领域、类别、类型、入库日期')
console.log('')
console.log('还需要你补 4 处：')
console.log('  · titleZh 中文标题')
console.log(`  · org     机构${isArxiv ? '（arXiv 的作者单位要去原文页面看）' : ''}`)
console.log('  · what    一句话是什么（不超过 40 字，只写原文里的事实）')
console.log('  · why     为什么值得你知道 ← 这一步才是本站别处抄不到的东西')
console.log('')
console.log('层级现在填的是「主干层」，确认一下是否合适（地基 / 主干 / 前沿 / 暂时存档）。')
console.log('')
console.log('推荐再加两件事：')
console.log('  · data/bodies.js 写一段站内正文（它做了什么 / 怎么做到的 / 局限在哪）')
console.log('  · data/map.js 把这个 id 挂到某个节点下')
console.log('')
console.log('写完之后跑：')
console.log('  node scripts/check-data.mjs     ← 有【待填】没补完会直接报错')
console.log('  node scripts/render-check.mjs')
console.log('  node scripts/build-feed.mjs')
