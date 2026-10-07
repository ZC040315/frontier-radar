# 前沿雷达

一个由我自己策展的前沿科技信息站。每条内容都回答三件事：**它是什么、为什么值得我知道、该挂进学习主干的哪一层**。

- 线上地址：https://zc040315.github.io/frontier-radar/
- 计划书：[网站建设计划规划书.md](网站建设计划规划书.md)
- 首次上线：2026-10-03（48 条，全部逐条联网核实）
- 每日自动更新：2026-10-04 起，每天早上 08:00 抓取过去 24 小时的前沿线索
- 来源规则：**只收一手**——学术一手（预印本 + 同行评议期刊）与官方一手（企业研究博客、官方新闻室）。
  **不收任何媒体、自媒体、聚合站与讨论区**。详见 [来源规则](#来源规则只收一手不收转载)。
- 阅读方式：**在站内读完，不用跳转**——每日线索的原文摘要在站内展开，正式条目有站内正文，链接只用于核对。

---

## 本地怎么看

直接双击 `index.html`。不需要服务器、不需要构建、不需要联网安装任何东西。

手机预览：浏览器打开开发者工具 → 切到手机尺寸即可（页面已适配，390px 宽无横向滚动）。

---

## 目录结构

```
前沿雷达/
├── index.html          ← 首页（雷达）：筛选 + 搜索 + 内容流
├── daily.html          ← 每日：近 7 天自动抓取的原始线索（按天分组）
├── categories.html     ← 分类：四个领域下的 15 个类别总览
├── map.html            ← 地图：四个领域的技术主干树
├── about.html          ← 关于：这个站是什么、内容怎么选、多久更新
├── assets/
│   ├── style.css       ← 全站样式（深空观测站主题）
│   ├── app.js          ← 首页逻辑：筛选、搜索、详情面板、本周新增
│   ├── map.js          ← 地图页逻辑：节点展开收拢 + 条目挂载
│   ├── daily.js        ← 每日线索的渲染（首页 24 小时区块 + daily.html）
│   └── categories.js   ← 分类总览页的渲染
├── data/
│   ├── items.js        ← 正式条目（加内容只改这里）
│   ├── bodies.js       ← 站内正文（按条目 id 写详情面板里的正文，可只写一部分）
│   ├── daily.js        ← 每天 08:00 自动生成的线索（请勿手工编辑）
│   ├── categories.js   ← 类别体系（15 个类别，领域之下更具体的一层）
│   └── map.js          ← 地图主干结构（节点 + 挂在这一节点下的条目 id）
├── scripts/
│   ├── fetch-daily.mjs ← 抓取脚本：抓源 → 过滤 → 分类 → 去重 → 写 data/daily.js
│   └── check-data.mjs  ← 数据自检：必填字段、类别合法性、id/链接重复、日期格式
├── .github/workflows/
│   └── daily.yml       ← 定时任务：每天 08:00 跑抓取并自动提交
└── design/             ← 阶段 1 的视觉概念图（存档，不参与页面）
```

---

## 每天 08:00 自动更新（每日线索）

**它做什么**：GitHub Actions 每天 00:00 UTC（北京时间 08:00）跑一次 `scripts/fetch-daily.mjs`，
把过去 24 小时的前沿线索写进 `data/daily.js`，自动提交，GitHub Pages 随之重新发布。
不需要你的电脑开着，也不需要任何 API key。

**两层窗口**：首页顶部显示「过去 24 小时」；`daily.html` 显示近 7 天、按天分组。

**抓取源**（想加减就改 `scripts/fetch-daily.mjs` 里的 `FEEDS` 数组和 arXiv 分类）：

| 类型 | 源 |
| --- | --- |
| 学术一手 · 预印本 | arXiv（cs.AI / cs.CL / cs.LG / cs.CV / cs.RO / q-bio.QM / eess.IV）、bioRxiv、medRxiv |
| 学术一手 · 期刊 | Nature、Nature Communications、Nature Medicine、Nature Biotechnology、Nature Methods、Nature Machine Intelligence、npj Digital Medicine、The Lancet Digital Health |
| 官方一手 | OpenAI、Google DeepMind、Google AI 官方博客、Microsoft Research、Apple 机器学习研究、AWS 机器学习博客、Meta 官方新闻室、NVIDIA 官方博客 |

**已移除的源**：Hacker News、MIT Technology Review、IEEE Spectrum、STAT News、Ars Technica、
The Verge、TechCrunch、量子位、IT之家。原因见下面的「来源规则」。想加减源就改
`scripts/fetch-daily.mjs` 里的 `FEEDS` 数组和 arXiv 分类。

**过滤规则**（宁可少，不要噪音）：

- 每个源按窗口时间筛选，只收窗口内的条目；
- 综合类来源（Nature、Nature Communications、Meta 新闻室等）必须在**标题**里命中四个领域的关键词才收录，
  正文里偶然提到一次不算；窄口径来源（npj Digital Medicine、The Lancet Digital Health、
  Nature Machine Intelligence 等）通过关键词闸门后即可收录；
- 消费数码上市、价格、预约、配色这类快讯直接丢掉；
- 与正式条目（`data/items.js`）重复的链接不会重复出现；
- 如果某次所有源都失败，脚本保留原文件不覆盖。

**自动收录 ≠ 已策展**：每日线索只记录来源页面上的标题、时间、来源和原文摘要，
不写解读、不做判断。摘要按原文保留到 1000 字，在页面上点标题就地展开，**不用点出去**。
觉得哪条值得留下，把它按下面的模板写成正式条目——
「为什么值得我知道」这一步永远由人来做。

**手动跑一次**：

- 线上：仓库 → Actions → 「每日雷达更新」→ Run workflow
- 本地：`node scripts/fetch-daily.mjs`（加 `--fresh` 完全重生成，加 `--seed` 播种多取一页 arXiv）

**两个已知限制**：GitHub 的定时任务可能延迟几分钟到十几分钟；仓库连续 60 天没有任何提交时，
GitHub 会自动暂停定时任务——随便推一次内容就会恢复。

---

## 加一条内容（每周维护，10 分钟内）

**第 1 步**：打开 `data/items.js`，复制下面这个模板，粘到 `items` 数组里（放在哪都行，首页会自动按日期倒序排）：

```js
{
  id: "unique-id",                     // 全站唯一，用英文小写，别改已发布条目的 id
  titleZh: "中文标题：一眼看懂说的是什么",
  titleOrig: "原文标题（照抄，别翻译）",
  type: "paper",                       // paper / product / policy
  domain: "ai",                        // med / ai / prod / infra
  layer: "trunk",                      // base / trunk / front / archive
  date: "2026-10-03",                  // 以原文页面的日期为准
  org: "机构或公司",
  what: "一句话是什么：不超过 40 字，说清它做了什么。",
  why: "为什么值得我知道：这一步才是本站别处抄不到的东西。",
  tags: ["标签A", "标签B"],
  link: "https://原文链接",
  related: ["另一条的id"],              // 可留空数组
  added: "2026-10-03",                 // 加进来的日期 → 首页会显示「本周新增」
  category: "ai-agent"                 // 必填：见下一页的 15 个类别
}
```

**第 2 步（可选，但强烈建议）**：打开 `data/bodies.js`，给这条写一段站内正文——
它做了什么、怎么做到的、局限在哪。不写也能正常显示，只是详情面板里少这一段。

**第 3 步**：如果这条要挂进地图，打开 `data/map.js`，把它的 `id` 加到某个节点的 `items` 数组里。

**第 4 步**：保存 → 跑一次自检 `node scripts/check-data.mjs` → 刷新 `index.html` 看一眼 → 按下节推送上线。

> 规则只有两条：**链接打不开的，不放进来**；**来源必须是学术一手或官方一手**，媒体转载一律不要。
> 宁可这周一条都不加，也不加自己没看懂、或没法核实的条目。

---

## 来源规则（只收一手，不收转载）

这个站只认两类来源：

| 类别 | 是什么 | 例子 |
| --- | --- | --- |
| 学术一手 | 预印本平台与同行评议期刊，看论文本身 | arXiv、bioRxiv、medRxiv、Nature 系列、The Lancet Digital Health |
| 官方一手 | 发布者自己的研究博客、新闻室与官方文档 | OpenAI、Google DeepMind、Microsoft Research、Apple 机器学习研究、AWS、Meta、NVIDIA |

**明确排除**：科技媒体、自媒体、聚合站与讨论区——36氪、机器之心、量子位、TechCrunch、
The Verge、Ars Technica、Hacker News 这一类。它们不是骗子，但它们是二手转述：
标题会为了点击被改写，判断会被掺进来，「这条信息最初是谁说的」也会变模糊。

**代价**：线索量会明显变少，而且明显偏论文。有的事媒体先报、官方后发，你会晚几天知道。
这个代价是主动接受的——晚几天知道，好过一直只知道别人想让你知道的版本。

**怎么落地**：

- 抓取脚本里只有学术与官方源；`data/daily.js` 的每条线索都带 `sourceType`（`academic` / `official`），
  在「每日」页显示成「学术一手」或「官方一手」。
- 正式条目（`data/items.js`）的 `link` 必须指向一手页面，不能指向报道该事件的媒体文章。
- 加内容前先问一句：这个链接是原始的，还是别人转述的？转述的就不加。

---

## 站内阅读（不用跳转）

链接只用于核对，不是必经之路：

- **每日线索**：抓取时把原文摘要（arXiv / bioRxiv 的 abstract）保留到 1000 字，页面上点标题就地展开。
  收拢状态只显示前 110 字，避免一屏塞满。出处链接在右侧元信息里，标为「出处 ↗」。
- **正式条目**：详情面板里渲染 `data/bodies.js` 里的站内正文，按「它做了什么 / 怎么做到的 / 局限在哪」分小节，
  末尾附一行「以上是我基于一手来源写的解读，不是转载」+ 出处链接。
- **正文的性质**：自己写的解读，不是转载，也不是翻译全文；引用只做短句转述。
  48 条正式条目已全部有正文（161 小节）。以后新加的条目如果一时写不出正文也不影响阅读——
  详情里的「一句话是什么 + 为什么重要」本身就是站内内容，正文是加分项。
- **改了正文或数据之后**：跑 `node scripts/check-data.mjs` 和 `node scripts/render-check.mjs` 各一次。
  前者查数据，后者查页面，两条都过了再推送。

---

## 类别体系（每条内容都必须归入一类）

领域（domain）是四个大类，**类别（category）是它下面更具体的一层**。定义在 `data/categories.js`。

| 领域 | 类别 |
| --- | --- |
| 医疗健康 | 医学影像与诊断、药物发现与蛋白质、临床文本与医疗流程、可穿戴与医疗器械 |
| AI 与智能体 | 大模型与推理、智能体与工具、多模态与生成、评测安全与对齐 |
| 数字产品与交互 | 交互范式与终端、生产力工具、平台与生态、消费硬件与机器人 |
| 交叉与基础设施 | 算力与芯片、数据与版权、监管与合规 |

**这条规则怎么落地**：

- 正式条目：每条必须有 `category` 字段，`scripts/check-data.mjs` 会检查它是否合法、有没有漏。
- 每日线索：抓取脚本用 `CATEGORY_RULES` 的关键词规则自动判类别（只看标题，避免摘要里的偶然词误伤），
  判不出来就按领域兜底。
- 页面上：首页有「类别」筛选行（会跟着领域联动），条目行显示类别标签，点详情面板里的类别可以跳到该类的总览。
- `categories.html` 是分类总览：每个类别有多少条正式条目、多少条每日线索、最近三条是什么。

**加一个新类别**：在 `data/categories.js` 里加一条，再到 `scripts/fetch-daily.mjs` 的 `CATEGORY_RULES`
里补对应关键词（越具体越往前放），然后跑 `node scripts/check-data.mjs` 确认。

---

## 怎么核实（加内容时照着做）

1. 打开原文页面，确认三件事：**标题、日期、机构**都对得上。
2. `what` 只写原文里的事实，不写「这将是未来」这类预测。
3. `why` 写我自己的理解，写不清就说明还没看懂——那就先不加。
4. 链接打不开的直接放弃，换一个能打开的来源。

首次上线时 48 条是用脚本批量核实的：先直接抓取页面，被反爬拦截的（Nature、Science、Reuters 这类）改用无头浏览器读取页面标题与发布日期。

---

## 推送上线

```powershell
cd "C:\Users\周超\Documents\ChatGPT\AI-SELF-TEXT\前沿雷达"
git add -A
git commit -m "内容：新增 N 条"
git push
```

推上去后 GitHub Pages 会自动重新发布，一两分钟后刷新线上地址就能看到。

---

## 上线时的注意事项

- **不要把 `前沿雷达/` 放回 `AI-SELF-TEXT` 仓库发布。** 那个仓库里有《关于我.md》等私人内容，一旦发布整个仓库都会公开。网站必须待在自己的 `frontier-radar` 仓库里。
- `data/` 用的是 `.js` 而不是 `.json`：本地双击打开时浏览器会拦截 `fetch` 读 json 文件，写成 js 直接赋值给变量就没这个问题，本地和线上表现一致。
- 内容总量控制在 45～60 条以内。数量不是目标，「每条都看懂」才是。
