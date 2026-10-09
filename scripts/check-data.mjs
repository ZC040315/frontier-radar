// 前沿雷达 · 数据自检
// 加完内容、或者怀疑哪里漏字段时跑一下：node scripts/check-data.mjs
// 检查项：必填字段、类别是否合法、id/链接是否重复、日期格式、每日线索是否也带了类别。

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve(import.meta.dirname, '..')

function load(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
  const sandbox = { window: {} }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox, { filename: file })
  return sandbox.window
}

const errors = []
const warns = []

const itemsWin = load('data/items.js')
const DATA = itemsWin.FRONTIER_DATA
const CATS = load('data/categories.js').FRONTIER_CATEGORIES || []
const CAT_IDS = new Set(CATS.map((c) => c.id))
const DOMAIN_IDS = new Set(DATA.domains.map((d) => d.id))
const LAYER_IDS = new Set(DATA.layers.map((l) => l.id))
const TYPE_IDS = new Set(DATA.types.map((t) => t.id))

const REQUIRED = ['id', 'titleZh', 'titleOrig', 'type', 'domain', 'layer', 'category', 'date', 'org', 'what', 'why', 'link']
const seenIds = new Set()
const seenLinks = new Set()

for (const item of DATA.items) {
  for (const f of REQUIRED) {
    if (!item[f]) errors.push(`正式条目 ${item.id || '(无 id)'} 缺字段：${f}`)
  }
  if (item.category && !CAT_IDS.has(item.category)) errors.push(`${item.id} 的类别不存在：${item.category}`)
  if (item.domain && !DOMAIN_IDS.has(item.domain)) errors.push(`${item.id} 的领域不存在：${item.domain}`)
  if (item.layer && !LAYER_IDS.has(item.layer)) errors.push(`${item.id} 的层级不存在：${item.layer}`)
  if (item.type && !TYPE_IDS.has(item.type)) errors.push(`${item.id} 的类型不存在：${item.type}`)
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(item.date || '')) warns.push(`${item.id} 的日期格式不标准：${item.date}`)
  if (!/^https?:\/\//.test(item.link || '')) errors.push(`${item.id} 的链接不是 http(s)：${item.link}`)
  if (seenIds.has(item.id)) errors.push(`id 重复：${item.id}`)
  seenIds.add(item.id)
  const norm = (item.link || '').replace(/\/$/, '')
  if (seenLinks.has(norm)) errors.push(`链接重复：${item.link}`)
  seenLinks.add(norm)
  for (const r of item.related || []) {
    if (!DATA.items.some((x) => x.id === r)) errors.push(`${item.id} 的相关条目不存在：${r}`)
  }

  // 未写完的草稿必须报错。scripts/promote.mjs 生成的条目会带【待填】占位，
  // 补完之前不该被推到线上——宁可这里拦住，也别让「一句话是什么：待填」出现在站上。
  for (const [k, v] of Object.entries(item)) {
    if (typeof v === 'string' && v.includes('【待填】')) {
      errors.push(`${item.id} 的「${k}」还是草稿占位，没写完（${v.slice(0, 40)}）`)
    }
  }
}

const usedCats = new Set(DATA.items.map((i) => i.category))
for (const cat of CATS) {
  if (!usedCats.has(cat.id)) warns.push(`类别「${cat.label}」还没有正式条目`)
}

let dailyCount = 0
try {
  const daily = load('data/daily.js').FRONTIER_DAILY
  dailyCount = (daily.items || []).length
  for (const d of daily.items || []) {
    if (!d.category) errors.push(`每日线索缺类别：${d.title}`)
    else if (!CAT_IDS.has(d.category)) errors.push(`每日线索类别不存在：${d.category}（${d.title}）`)
    if (!d.domain || !d.url || !d.published) errors.push(`每日线索字段不全：${d.title}`)
  }
} catch (e) {
  warns.push('还没有 data/daily.js（等第一次抓取生成）')
}

console.log(`正式条目 ${DATA.items.length} 条 · 类别 ${CATS.length} 个 · 每日线索 ${dailyCount} 条`)
console.log(`覆盖类别 ${usedCats.size}/${CATS.length}`)
if (warns.length) {
  console.log('\n提醒：')
  warns.forEach((w) => console.log('  · ' + w))
}
if (errors.length) {
  console.log('\n错误：')
  errors.forEach((e) => console.log('  ✗ ' + e))
  process.exit(1)
}
console.log('\n数据自检通过 ✓')
