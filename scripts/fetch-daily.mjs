// 前沿雷达 · 每日抓取
// 每天 08:00（北京时间）由 GitHub Actions 调用：抓取最近一段时间内的真实线索，写入 data/daily.js。
// 只记录来源页面上的事实——标题、时间、来源、链接、原文摘要；
// 不生成任何评价性文字，「为什么值得知道」那一步永远留给人。
//
// 用法：node scripts/fetch-daily.mjs [--days=7] [--max=60] [--seed]
//   --days  抓取窗口（默认 7 天，用于凑满「近 7 天」归档）
//   --seed  首次播种：arXiv 多取一页
//   --fresh 忽略已有 data/daily.js，完全重新生成（清理历史噪音时用）

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=?(.*)$/.exec(a)
    return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true]
  })
)

const DAYS = Number(args.days || 7)
const MAX_ITEMS = Number(args.max || 60)
const SEED = Boolean(args.seed)
const FRESH = Boolean(args.fresh)
const ROOT = path.resolve(import.meta.dirname, '..')
const DATA_FILE = path.join(ROOT, 'data', 'daily.js')
const CURATED_FILE = path.join(ROOT, 'data', 'items.js')
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const now = new Date()
const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000)
const fetchStart = new Date(now.getTime() - DAYS * 24 * 3600 * 1000)

const log = (...a) => console.log(...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 通用工具 ----------

function clean(html = '') {
  return String(html)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    // 先把转义实体还原（否则 &lt;p&gt; 会绕过下面的去标签）
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(text, max = 240) {
  const t = clean(text)
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

function idFor(url) {
  return 'd-' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 10)
}

function normalizeUrl(u) {
  try {
    const url = new URL(u)
    url.hash = ''
    url.search = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return String(u || '').trim()
  }
}

function inRange(dateStr, from = fetchStart) {
  const d = new Date(dateStr)
  return !isNaN(d.getTime()) && d >= from && d.getTime() <= now.getTime() + 12 * 3600 * 1000
}

async function get(url, { as = 'text', timeout = 25000, accept, retries = 2 } = {}) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Accept: accept || 'application/atom+xml,application/rss+xml,application/json,text/xml,*/*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
      })
      if (res.status === 429 || res.status === 503) throw new Error(`HTTP ${res.status}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return as === 'json' ? res.json() : res.text()
    } catch (e) {
      lastErr = e
      if (i < retries) await sleep(4000 * (i + 1))
    }
  }
  throw lastErr
}

// ---------- 领域分类（关键词规则；命中不了归 AI） ----------

// 默认分类只做一件保守的事：认出医学内容，其余归到给它的默认领域。
// 具体的领域判断交给下面的强规则，避免 app / store / design 这类短词误伤
// （比如 appearance、storage、designed 都会被当成产品）。
const MED_LOOSE =
  /\b(medical|medicine|clinical|patient|healthcare|hospital|diagnosis|diagnostic|drug|protein|biolog|genomic|pathology|therapy|therapeutic|cancer|radiolog|surgical|fda|disease|biomarker|vaccine)\b|医疗|临床|诊断|药物|病理|患者|手术机器人|健康监测/i

function classify(text, fallback = 'ai') {
  return MED_LOOSE.test(text || '') ? 'med' : fallback
}

// 面向「综合类来源」（IT之家、Hacker News、Nature、MIT TR 等）的强过滤：
// 必须命中四个领域之一的关键词才收录，否则丢进垃圾桶——宁缺毋滥。
const STRONG = [
  [
    'med',
    /(medical imaging|medical ai|clinic|patient|healthcare|health tech|diagnos|drug discovery|protein (structure|design)|genom|patholog|therap|cancer|radiolog|surg|fda|disease|biomarker|vaccine|脑机|医疗|临床|诊断|药物|病理|患者|手术机器人|健康监测)/i,
  ],
  [
    'infra',
    /(semiconductor|ai chip|ai accelerator|data ?cent|datacenter|supercomput|compute cluster|hbm|foundry|export control|ai act|ai policy|ai regulation|copyright|lawsuit|agent protocol|interoperability standard|芯片|算力|数据中心|超算|半导体|晶圆|出口管制|人工智能.{0,6}(监管|法案|合规)|AI 法案|版权|诉讼|互操作|技术标准|接口标准)/i,
  ],
  [
    'ai',
    /\b(ai|agi|llm|llms|large language model|machine learning|deep learning|neural|agent|agents|agentic|transformer|diffusion model|inference|fine-?tun|benchmark|hallucinat|multimodal|reinforcement learning|superintelligence)\b|人工智能|大模型|智能体|生成式|机器学习|深度学习|推理模型/i,
  ],
  [
    'prod',
    /\b(smart glasses|ar glasses|vr headset|humanoid|spatial computing|interaction paradigm|agent store|smart ring|brain-computer|brain implant|voice interface|ambient computing|autonomous vehicle|self-driving)\b|智能眼镜|人形机器人|交互范式|智能体平台|脑机|智能戒指|穿戴设备/i,
  ],
]

function strongDomain(text) {
  const t = text || ''
  for (const [domain, re] of STRONG) if (re.test(t)) return domain
  return null
}

// 消费数码 / 商品促销类新闻：不是这个站要的东西，直接丢掉
const NOISE =
  /(上架|开售|开启预约|开启预售|现已预约|售价|定价为|元起|国补|配色|预热|曝光|发布会定档|促销|降价|优惠|折扣|免运费|游戏《|手游|Steam|开箱评测|直播带货|京东|天猫|拼多多|图赏|上手体验)/i

// ---------- 采集 ----------

const results = []

function push(item) {
  if (!item.title || !item.url) return
  if (!inRange(item.published)) return
  if (NOISE.test(item.title) || NOISE.test(item.summary)) return
  results.push({
    id: idFor(normalizeUrl(item.url)),
    title: clean(item.title).slice(0, 200),
    url: item.url,
    source: item.source,
    kind: item.kind || 'news',
    published: new Date(item.published).toISOString(),
    summary: clip(item.summary, 240),
    domain: item.domain || classify(clean(item.title) + ' ' + clean(item.summary)),
    score: item.score || 0,
  })
}

// 1) arXiv：一次组合查询，避免限流
async function fetchArxiv() {
  const cats = ['cs.AI', 'cs.CL', 'cs.LG', 'cs.CV', 'cs.RO', 'q-bio.QM', 'eess.IV']
  const query = cats.map((c) => 'cat:' + c).join('+OR+')
  const pages = SEED ? 2 : 1
  const collected = []
  for (let p = 0; p < pages; p++) {
    const url =
      'http://export.arxiv.org/api/query?search_query=' +
      encodeURIComponent(query).replace(/%2BOR%2B/g, '+OR+') +
      `&sortBy=submittedDate&sortOrder=descending&max_results=120&start=${p * 120}`
    try {
      const xml = await get(url, { accept: 'application/atom+xml', retries: 3 })
      for (const e of xml.split('<entry>').slice(1)) {
        const title = (/<title>([\s\S]*?)<\/title>/.exec(e) || [])[1]
        const id = (/<id>([\s\S]*?)<\/id>/.exec(e) || [])[1]
        const published = (/<published>([\s\S]*?)<\/published>/.exec(e) || [])[1]
        const summary = (/<summary>([\s\S]*?)<\/summary>/.exec(e) || [])[1]
        const cats2 = Array.from(e.matchAll(/<category[^>]*term=["']([^"']+)["']/g)).map((m) => m[1])
        if (!title || !id || !inRange(published)) continue
        // 学科分类兜底：生物医学 / 医学影像 → med，机器人 → prod，其余 → ai
        const primary = cats2[0] || ''
        const fallback = primary.startsWith('q-bio') || primary === 'eess.IV' ? 'med' : primary === 'cs.RO' ? 'prod' : 'ai'
        collected.push({
          title,
          url: id.trim(),
          source: 'arXiv ' + (cats2[0] || 'preprint'),
          kind: 'paper',
          published,
          summary,
          domain: strongDomain(clean(title)) || fallback,
        })
      }
      log(`  arXiv 第 ${p + 1} 页：累计 ${collected.length} 条候选`)
    } catch (e) {
      log(`  arXiv 第 ${p + 1} 页：失败（${e.message}）`)
    }
    await sleep(3500)
  }
  // 论文每天数量巨大，这里只取最新的 14 篇，避免淹没其他线索
  const picked = collected.slice(0, 14)
  picked.forEach((it) => push(it))
  log(`  arXiv：收录最新 ${picked.length} 篇（候选 ${collected.length} 篇）`)
}

// 2) Hacker News：行业讨论热度
async function fetchHackerNews() {
  try {
    const since = Math.floor(fetchStart.getTime() / 1000)
    const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E200,created_at_i%3E${since}&hitsPerPage=40`
    const json = await get(url, { as: 'json' })
    let used = 0
    for (const h of json.hits || []) {
      if (used >= 8) break
      if (!h.title || !h.url || !inRange(h.created_at)) continue
      // 综合讨论区：标题里必须有技术信号，且按标题判领域
      if (!/\b(ai|llm|model|agent|robot|chip|gpu|compute|datacenter|copyright|regulation|protocol|algorithm|inference|neural)\b|人工智能|大模型|智能体/i.test(h.title)) continue
      const domain = strongDomain(h.title)
      if (!domain) continue
      push({
        title: h.title,
        url: h.url,
        source: 'Hacker News · ' + h.points + ' 分',
        kind: 'discussion',
        published: h.created_at,
        summary: `${h.points} 分 · ${h.num_comments} 条评论 · 讨论区：https://news.ycombinator.com/item?id=${h.objectID}`,
        domain,
        score: h.points,
      })
      used++
    }
    log(`  Hacker News：${used} 条`)
  } catch (e) {
    log(`  Hacker News：失败（${e.message}）`)
  }
}

// 3) RSS 订阅源
const FEEDS = [
  // topical = true：这个源本身就在讲我们的四个领域，全部收录；否则走强过滤
  { url: 'https://openai.com/news/rss.xml', name: 'OpenAI', kind: 'product', max: 6, topical: true },
  { url: 'https://deepmind.google/blog/rss.xml', name: 'Google DeepMind', kind: 'product', max: 5, topical: true },
  { url: 'https://www.microsoft.com/en-us/research/feed/', name: 'Microsoft Research', kind: 'paper', max: 4 },
  // 医学期刊：必须是「技术 / 方法」类进展，纯临床营养试验之类的请出去
  {
    url: 'https://www.nature.com/nm.rss',
    name: 'Nature Medicine',
    kind: 'paper',
    max: 5,
    domain: 'med',
    require: /\b(ai|artificial intelligence|machine learning|deep learning|algorithm|model|device|sensor|wearable|robot|imaging|diagnos|genom|protein|drug|biomarker|cell-free|digital|sequenc)/i,
  },
  // Nature 是综合科学刊：只留带技术/方法信号的（半导体、AI、成像等），纯临床或生态话题不要
  {
    url: 'https://www.nature.com/nature.rss',
    name: 'Nature',
    kind: 'paper',
    max: 5,
    require: /\b(ai|artificial intelligence|machine learning|deep learning|algorithm|model|chip|semiconductor|quantum|robot|imaging|genom|protein|drug|biomarker|digital|comput)/i,
  },
  { url: 'https://www.technologyreview.com/feed/', name: 'MIT Technology Review', kind: 'news', max: 4 },
  { url: 'https://spectrum.ieee.org/feeds/feed.rss', name: 'IEEE Spectrum', kind: 'news', max: 4 },
  { url: 'https://www.ithome.com/rss/', name: 'IT之家', kind: 'news', max: 5 },
  { url: 'https://www.qbitai.com/feed', name: '量子位', kind: 'news', max: 5, domain: 'ai', topical: true },
  {
    url: 'https://www.statnews.com/feed/',
    name: 'STAT News',
    kind: 'news',
    max: 4,
    domain: 'med',
    require: /\b(ai|artificial intelligence|machine learning|drug|biotech|fda|device|genomic|diagnos|robot|digital health|therapy|vaccine|trial)/i,
  },
  { url: 'https://blogs.nvidia.com/feed/', name: 'NVIDIA', kind: 'product', max: 4, domain: 'infra', topical: true },
  {
    url: 'https://www.theverge.com/rss/index.xml',
    name: 'The Verge',
    kind: 'news',
    max: 4,
    require: /\b(ai|artificial intelligence|robot|glasses|wearable|device|app|software|chip|browser|assistant|model|agent|headset)/i,
  },
  { url: 'https://feeds.arstechnica.com/arstechnica/index', name: 'Ars Technica', kind: 'news', max: 4 },
  { url: 'https://techcrunch.com/feed/', name: 'TechCrunch', kind: 'news', max: 4 },
]

function parseFeed(xml) {
  const atoms = xml.includes('<entry')
  const blocks = xml
    .split(atoms ? /<entry[\s>]/ : /<item[\s>]/)
    .slice(1)
  return blocks.map((raw) => {
    const pick = (re) => {
      const m = re.exec(raw)
      return m ? m[1] : ''
    }
    let link = pick(/<link[^>]*href=["']([^"']+)["']/)
    if (!link) link = pick(/<link[^>]*>([\s\S]*?)<\/link>/)
    const date =
      pick(/<pubDate>([\s\S]*?)<\/pubDate>/) ||
      pick(/<published>([\s\S]*?)<\/published>/) ||
      pick(/<updated>([\s\S]*?)<\/updated>/) ||
      pick(/<dc:date>([\s\S]*?)<\/dc:date>/)
    const summary =
      pick(/<description>([\s\S]*?)<\/description>/) ||
      pick(/<summary[^>]*>([\s\S]*?)<\/summary>/) ||
      pick(/<content:encoded>([\s\S]*?)<\/content:encoded>/)
    return {
      title: pick(/<title[^>]*>([\s\S]*?)<\/title>/),
      link: clean(link),
      date: clean(date),
      summary,
    }
  })
}

async function fetchFeeds() {
  for (const f of FEEDS) {
    try {
      const xml = await get(f.url)
      const rows = parseFeed(xml)
      let used = 0
      for (const row of rows) {
        if (used >= f.max) break
        if (!row.title || !row.link || !inRange(row.date)) continue
        const title = clean(row.title)
        const text = title + ' ' + clean(row.summary)
        if (f.require && !f.require.test(title)) continue
        // 综合类来源只认标题里的信号：正文里偶然提到一次关键词不算
        const domain = f.domain || (f.topical ? classify(text, 'ai') : strongDomain(title))
        if (!domain) continue
        push({
          title: row.title,
          url: row.link,
          source: f.name,
          kind: f.kind,
          published: row.date,
          summary: row.summary,
          domain,
        })
        used++
      }
      log(`  ${f.name}：${used} 条`)
    } catch (e) {
      log(`  ${f.name}：失败（${e.message}）`)
    }
  }
}

// ---------- 去重与合并 ----------

function curatedUrls() {
  try {
    const src = fs.readFileSync(CURATED_FILE, 'utf8')
    return new Set(Array.from(src.matchAll(/link:\s*"([^"]+)"/g)).map((m) => normalizeUrl(m[1])))
  } catch {
    return new Set()
  }
}

function previousItems() {
  try {
    const src = fs.readFileSync(DATA_FILE, 'utf8')
    const parsed = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1))
    return Array.isArray(parsed.items) ? parsed.items : []
  } catch {
    return []
  }
}

// ---------- 主流程 ----------

async function main() {
  log(`每日抓取开始：现在 ${now.toISOString()}，抓取窗口 ${DAYS} 天${SEED ? '（播种模式）' : ''}`)
  log('数据源：')
  await fetchArxiv()
  await fetchHackerNews()
  await fetchFeeds()

  const curated = curatedUrls()
  const seen = new Set()
  const merged = []
  const carryOver = FRESH ? [] : previousItems()
  for (const item of [...results, ...carryOver]) {
    const key = normalizeUrl(item.url)
    if (!key || curated.has(key) || seen.has(key)) continue
    if (!inRange(item.published)) continue
    seen.add(key)
    merged.push(item)
  }
  merged.sort((a, b) => (a.published < b.published ? 1 : -1))
  const items = merged.slice(0, MAX_ITEMS)

  // 保护：这一次所有源都失败、且历史也没有内容时，不要写空文件覆盖线上数据
  if (!items.length) {
    log('本次没有任何可写入的条目（数据源全部失败或无新内容），保留原文件不动。')
    return
  }

  const last24 = items.filter((i) => new Date(i.published) >= dayAgo)
  const out = {
    generatedAt: now.toISOString(),
    windowStart: fetchStart.toISOString(),
    last24hSince: dayAgo.toISOString(),
    days: DAYS,
    counts: {
      total: items.length,
      last24h: last24.length,
      byDomain: items.reduce((acc, i) => ((acc[i.domain] = (acc[i.domain] || 0) + 1), acc), {}),
      bySource: items.reduce((acc, i) => ((acc[i.source.split(' ')[0]] = (acc[i.source.split(' ')[0]] || 0) + 1), acc), {}),
    },
    items,
  }

  const header = `// 前沿雷达 · 每日自动收录（GitHub Actions 每天 08:00 生成，请勿手工编辑）
// 只记录来源页面上的事实：标题、时间、来源、链接、原文摘要；未经策展，判断留给人来做。
// 生成时间：${now.toISOString()}｜抓取窗口：${DAYS} 天｜其中过去 24 小时 ${last24.length} 条

`
  fs.writeFileSync(DATA_FILE, header + 'window.FRONTIER_DAILY = ' + JSON.stringify(out, null, 2) + ';\n')

  log('')
  log(`写入 ${path.relative(ROOT, DATA_FILE)}`)
  log(`过去 24 小时 ${last24.length} 条 / 近 ${DAYS} 天共 ${items.length} 条`)
  log('按领域：', out.counts.byDomain)
  log('按来源：', out.counts.bySource)
}

main().catch((e) => {
  console.error('抓取失败：', e)
  process.exit(1)
})
