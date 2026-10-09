// 前沿雷达 · 每日抓取
// 每天 08:00（北京时间）由 GitHub Actions 调用：抓取最近一段时间内的真实线索，写入 data/daily.js。
// 只记录来源页面上的事实——标题、时间、来源、链接、原文摘要；
// 不生成任何评价性文字，「为什么值得知道」那一步永远留给人。
//
// 来源规则：只收学术一手（预印本平台、同行评议期刊）和官方一手（企业/机构自己的
// 研究博客与新闻室）。不收科技媒体、自媒体、聚合站与讨论区。
// 摘要按原文保留到 1000 字，让读者在站内就能读完，不必点出去。
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

// 去重和 id 都用这个键。注意协议不参与计算——arXiv 的 Atom 接口返回 http://，
// 而 arXiv 实际只服务 https，不统一的话同一篇论文会被当成两条。
function normalizeUrl(u) {
  try {
    const url = new URL(u)
    url.hash = ''
    url.search = ''
    return (url.host + url.pathname).replace(/\/$/, '')
  } catch {
    return String(u || '').trim()
  }
}

// arXiv 已经只服务 https：实测 http:// 超时 30 秒，https:// 返回 200。
// 直接把接口给的 id 存下来，会让「每日」页里每一条 arXiv 链接都点不开
// （2026-10-09 发现，60 条线索里 28 条是死链）。
function toHttps(u) {
  return String(u || '').trim().replace(/^http:\/\//i, 'https://')
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

// 类别判定：领域之下更具体的一层，规则顺序即优先级（越具体越靠前）
const CATEGORY_RULES = [
  ['med-imaging', /(medical imaging|radiolog|patholog|ct scan|mri|x-ray|ultrasound|image segmentation|histopath|影像|病理|放射|超声|切片)/i],
  ['med-drug', /(protein|drug discovery|molecul|antibody|small molecule|genomic|gene therapy|crispr|biolog|vaccine|药物|蛋白|基因|分子|抗体|疫苗)/i],
  ['med-device', /(wearable|sensor|implant|surgical robot|robotic surgery|continuous monitoring|prosthes|可穿戴|植入|手术机器人|监护设备)/i],
  ['med-clinic', /(clinical|patient|ehr|medical record|diagnos|triage|consultation|nurse|病历|临床|问诊|诊断|医疗流程|患者)/i],
  ['ai-agent', /(agentic|multi-agent|tool use|tool calling|function call|mcp\b|a2a\b|workflow automation|autonomous agent|\bagents?\b|智能体|工具调用|多智能体|自动化流程)/i],
  ['ai-multimodal', /(image generation|video generation|multimodal|text-to-image|text-to-video|3d generat|world model|speech model|voice model|deepfake|多模态|世界模型|文生图|文生视频|语音模型|数字人|换脸|生成视频|生成图片|生成式视频)/i],
  ['ai-safety', /(ai safety|alignment|hallucinat|evaluat|benchmark|red team|jailbreak|interpretab|misuse|安全|对齐|幻觉|评测|基准|越狱|可解释)/i],
  ['ai-model', /(language model|\bllm\b|reasoning|pre-?training|fine-?tun|inference|transformer|context window|distillation|quantization|大模型|推理模型|训练|微调|上下文|蒸馏|量化)/i],
  ['prod-paradigm', /(smart glasses|ar glasses|vr headset|spatial comput|voice interface|brain-computer|brain implant|interaction paradigm|眼镜|头显|空间计算|无屏交互|脑机)/i],
  ['prod-tools', /(coding assistant|copilot|developer tool|productivity|note-taking|meeting|design tool|writing|notebook|编程助手|生产力|会议|知识管理|设计工具|写作)/i],
  ['prod-platform', /(app store|agent store|marketplace|distribution platform|ecosystem|api economy|分发|生态|应用商店|平台经济)/i],
  ['prod-hardware', /(humanoid|home robot|robot vacuum|smart ring|consumer device|drone|人形机器人|家用机器人|智能戒指|消费硬件)/i],
  ['infra-compute', /(\bgpu\b|\btpu\b|chip|semiconductor|data ?cent|compute cluster|training cost|supercomput|算力|芯片|数据中心|超算|半导体|训练成本)/i],
  ['infra-data', /(copyright|training data|licens|dataset|data deal|scraping|版权|训练数据|授权|数据集|数据抓取)/i],
  ['infra-policy', /(regulat|regulator|\bact\b|\blaw\b|compliance|approval|standard|bill|hearing|监管|法案|合规|审批|标准|法规|听证|立法|行政令|政策)/i],
]

const CATEGORY_FALLBACK = {
  med: 'med-clinic',
  ai: 'ai-model',
  prod: 'prod-tools',
  infra: 'infra-compute',
}

function categoryFor(text, domain) {
  const t = text || ''
  for (const [id, re] of CATEGORY_RULES) if (re.test(t)) return id
  return CATEGORY_FALLBACK[domain] || 'ai-model'
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
  const title = clean(item.title)
  // 兜底：万一以后新增的源给的是 http，至少让它在日志里露出来
  if (/^http:\/\//i.test(item.url)) {
    log(`  ⚠ ${item.source} 给的是 http 链接，可能点不开：${item.url}`)
  }
  const domain = item.domain || classify(title + ' ' + clean(item.summary))
  results.push({
    id: idFor(normalizeUrl(item.url)),
    title: title.slice(0, 200),
    url: item.url,
    source: item.source,
    sourceType: item.sourceType || 'official',
    kind: item.kind || 'news',
    published: new Date(item.published).toISOString(),
    // 摘要保留得长一些：每日线索要在站内就能读完，不该逼人点出去。
    // 1000 字足够覆盖 arXiv / bioRxiv 的完整 abstract。
    summary: clip(item.summary, 1000),
    domain,
    // 类别只看标题：摘要里偶然出现的词（广告、药物之类）容易误伤
    category: item.category || categoryFor(title, domain),
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
          url: toHttps(id),
          source: 'arXiv ' + (cats2[0] || 'preprint'),
          sourceType: 'academic',
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

// 2) bioRxiv / medRxiv：生物医学预印本（学术一手）
// 每日线索里的摘要会原样保留在站内，读者不需要点出去才能读完。
async function fetchBiorxiv() {
  // 这个接口有两个坑：一是结果按日期「正序」返回（最早的在最前），
  // 二是每页固定 30 条。所以查 7 天窗口只会拿到第一天的内容。
  // 对策：只查一个窄窗口（昨天→明天），再靠游标翻两页。
  const start = new Date(now.getTime() - 36 * 3600 * 1000).toISOString().slice(0, 10)
  const end = new Date(now.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10)
  for (const [server, name] of [
    ['biorxiv', 'bioRxiv'],
    ['medrxiv', 'medRxiv'],
  ]) {
    let used = 0
    let seen = 0
    for (let page = 0; page < 2; page++) {
      try {
        const cursor = page * 30
        const url = `https://api.biorxiv.org/details/${server}/${start}/${end}${cursor ? '/' + cursor : ''}`
        const json = await get(url, { as: 'json', retries: 2, accept: 'application/json' })
        const rows = json.collection || []
        seen += rows.length
        if (!rows.length) break
        for (const r of rows) {
          if (used >= 8) break
          const title = clean(r.title)
          if (!title || !inRange(r.date)) continue
          push({
            title,
            url: `https://www.${server}.org/content/${r.doi}v${r.version || 1}`,
            source: name,
            sourceType: 'academic',
            kind: 'paper',
            published: r.date,
            summary: r.abstract || '',
            domain: strongDomain(title) || 'med',
          })
          used++
        }
      } catch (e) {
        log(`  ${name} 第 ${page + 1} 页：失败（${e.message}）`)
      }
      if (used >= 8) break
      await sleep(1200)
    }
    log(`  ${name}：${used} 条（抓取窗口 ${start} ~ ${end}，共扫描 ${seen} 条）`)
  }
}

// 3) RSS 订阅源
//
// 来源规则（硬约束）：只收两类一手来源。
//   academic = 预印本平台、同行评议期刊
//   official = 企业或机构自己的研究博客、官方新闻室、官方文档
// 不收：科技媒体、自媒体、聚合站、讨论区——它们是二手转述，会引入标题党，
// 也会让「一条信息最初是谁说的」变得模糊。
//
// topical = true：这个源整体就在讲我们的四个领域，通过 require 后全部收录，
// 领域交给 classify 判断；没有 topical 的源则要求标题命中强关键词。
const FEEDS = [
  // ---------- 官方一手：实验室与公司 ----------
  { url: 'https://openai.com/news/rss.xml', name: 'OpenAI', sourceType: 'official', kind: 'product', max: 6, topical: true },
  { url: 'https://deepmind.google/blog/rss.xml', name: 'Google DeepMind', sourceType: 'official', kind: 'product', max: 5, topical: true },
  { url: 'https://blog.google/technology/ai/rss/', name: 'Google AI 官方博客', sourceType: 'official', kind: 'product', max: 5, topical: true },
  { url: 'https://machinelearning.apple.com/rss.xml', name: 'Apple 机器学习研究', sourceType: 'official', kind: 'paper', max: 4, topical: true },
  { url: 'https://aws.amazon.com/blogs/machine-learning/feed/', name: 'AWS 机器学习博客', sourceType: 'official', kind: 'product', max: 4, topical: true },
  { url: 'https://blogs.nvidia.com/feed/', name: 'NVIDIA 官方博客', sourceType: 'official', kind: 'product', max: 4, domain: 'infra', topical: true },
  {
    url: 'https://www.microsoft.com/en-us/research/feed/',
    name: 'Microsoft Research',
    sourceType: 'official',
    kind: 'paper',
    max: 4,
    topical: true,
    require: /\b(ai|artificial intelligence|machine learning|language model|agent|multimodal|robot|medical|health|chip|quantum comput|inference|neural)/i,
  },
  // Meta 新闻室是综合源：只有标题命中技术信号才收
  {
    url: 'https://about.fb.com/news/feed/',
    name: 'Meta 官方新闻室',
    sourceType: 'official',
    kind: 'product',
    max: 4,
    topical: true,
    require: /\b(ai|artificial intelligence|machine learning|llama|model|agent|glasses|wearable|headset|robot|spatial)/i,
  },

  // ---------- 学术一手：同行评议期刊 ----------
  // 综合科学刊：只留带技术/方法信号的（AI、半导体、成像等），纯生态或纯临床话题不要
  {
    url: 'https://www.nature.com/nature.rss',
    name: 'Nature',
    sourceType: 'academic',
    kind: 'paper',
    max: 5,
    topical: true,
    require: /\b(ai|artificial intelligence|machine learning|deep learning|algorithm|model|chip|semiconductor|quantum|robot|imaging|genom|protein|drug|biomarker|digital|comput)/i,
  },
  {
    url: 'https://www.nature.com/ncomms.rss',
    name: 'Nature Communications',
    sourceType: 'academic',
    kind: 'paper',
    max: 4,
    topical: true,
    require: /\b(ai|artificial intelligence|machine learning|deep learning|algorithm|model|chip|semiconductor|quantum|robot|imaging|genom|protein|drug|biomarker|comput|neural)/i,
  },
  // 医学期刊：必须是「技术 / 方法」类进展，纯临床试验报告请出去
  {
    url: 'https://www.nature.com/nm.rss',
    name: 'Nature Medicine',
    sourceType: 'academic',
    kind: 'paper',
    max: 5,
    domain: 'med',
    topical: true,
    require: /\b(ai|artificial intelligence|machine learning|deep learning|algorithm|model|device|sensor|wearable|robot|imaging|diagnos|genom|protein|drug|biomarker|cell-free|digital|sequenc)/i,
  },
  {
    url: 'https://www.nature.com/nbt.rss',
    name: 'Nature Biotechnology',
    sourceType: 'academic',
    kind: 'paper',
    max: 4,
    domain: 'med',
    topical: true,
    require: /\b(ai|machine learning|deep learning|protein|drug|genom|crispr|biolog|antibody|vaccine|therap|diagnos|model|algorithm|cell)/i,
  },
  {
    url: 'https://www.nature.com/nmeth.rss',
    name: 'Nature Methods',
    sourceType: 'academic',
    kind: 'paper',
    max: 4,
    topical: true,
    require: /\b(ai|machine learning|deep learning|model|algorithm|imaging|sequenc|proteom|microscop|neural|comput|foundation model)/i,
  },
  // 这两本整体就在「数字医疗」这个交叉点上，通过即可收
  {
    url: 'https://www.nature.com/natmachintell.rss',
    name: 'Nature Machine Intelligence',
    sourceType: 'academic',
    kind: 'paper',
    max: 4,
    domain: 'ai',
    topical: true,
  },
  {
    url: 'https://www.nature.com/npjdigitalmed.rss',
    name: 'npj Digital Medicine',
    sourceType: 'academic',
    kind: 'paper',
    max: 4,
    domain: 'med',
    topical: true,
  },
  {
    url: 'https://www.thelancet.com/rssfeed/landig_current.xml',
    name: 'The Lancet Digital Health',
    sourceType: 'academic',
    kind: 'paper',
    max: 4,
    domain: 'med',
    topical: true,
  },
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
          sourceType: f.sourceType || 'official',
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
  await fetchBiorxiv()
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
// 来源规则：只收学术一手（arXiv / bioRxiv / medRxiv / 同行评议期刊）与官方一手（企业研究博客与新闻室）。
// 不收媒体、自媒体与讨论区。只记录来源页面上的事实：标题、时间、来源、链接、原文摘要；未经策展，判断留给人来做。
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
