// 前沿雷达 · 分类总览页
// 把四个领域下面的每个类别摊开：这一类有多少条、在讲什么、最近几条是哪些。
(function () {
  "use strict";

  var DATA = window.FRONTIER_DATA;
  var CATS = window.FRONTIER_CATEGORIES || [];
  var DAILY = window.FRONTIER_DAILY || { items: [] };
  var host = document.getElementById("categoryList");
  if (!DATA || !host) return;

  var DOMAIN_LABEL = {};
  DATA.domains.forEach(function (d) { DOMAIN_LABEL[d.id] = d.label; });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var curatedByCat = {};
  DATA.items.forEach(function (it) {
    (curatedByCat[it.category] = curatedByCat[it.category] || []).push(it);
  });
  var dailyByCat = {};
  (DAILY.items || []).forEach(function (it) {
    if (!it.category) return;
    dailyByCat[it.category] = (dailyByCat[it.category] || 0) + 1;
  });

  var totalCurated = DATA.items.length;
  var totalDaily = (DAILY.items || []).length;
  var summary = document.getElementById("categorySummaryLine");
  if (summary) {
    summary.textContent =
      CATS.length +
      " 个类别 · 正式条目 " +
      totalCurated +
      " 条 · 每日线索 " +
      totalDaily +
      " 条（每条内容都归入其中一个类别）";
  }

  DATA.domains.forEach(function (domain) {
    var cats = CATS.filter(function (c) { return c.domain === domain.id; });
    if (!cats.length) return;

    var section = el("section", "cat-domain");
    var head = el("header", "cat-domain-head");
    head.appendChild(el("h2", null, DOMAIN_LABEL[domain.id] || domain.id));
    var curatedInDomain = DATA.items.filter(function (i) { return i.domain === domain.id; }).length;
    head.appendChild(el("span", "cat-domain-count", curatedInDomain + " 条正式条目"));
    section.appendChild(head);

    var grid = el("div", "cat-grid");
    cats.forEach(function (cat) {
      var items = (curatedByCat[cat.id] || []).slice().sort(function (a, b) {
        return a.date < b.date ? 1 : -1;
      });
      var card = el("article", "cat-card");
      card.id = "cat-" + cat.id;

      var top = el("div", "cat-card-head");
      top.appendChild(el("h3", "cat-card-title", cat.label));
      top.appendChild(el("span", "cat-card-count", items.length + " 条"));
      card.appendChild(top);

      card.appendChild(el("p", "cat-card-desc", cat.desc));

      var meta = el("p", "cat-card-meta");
      meta.appendChild(el("span", null, "每日线索 " + (dailyByCat[cat.id] || 0) + " 条"));
      var link = el("a", "cat-card-all", "看这一类全部 →");
      link.href = "index.html?cat=" + cat.id;
      meta.appendChild(link);
      card.appendChild(meta);

      if (items.length) {
        var ul = el("ul", "cat-card-items");
        items.slice(0, 3).forEach(function (it) {
          var li = el("li");
          var a = el("a", null, it.titleZh);
          a.href = "index.html#item-" + it.id;
          li.appendChild(a);
          li.appendChild(el("span", "cat-card-date", it.date));
          ul.appendChild(li);
        });
        card.appendChild(ul);
      } else {
        card.appendChild(el("p", "cat-card-empty", "这一类还没有正式条目——线索都躺在「每日」里等着被策展。"));
      }

      grid.appendChild(card);
    });
    section.appendChild(grid);
    host.appendChild(section);
  });

  // 高亮从详情面板跳过来的那一类
  if (/^#cat-/.test(location.hash)) {
    var target = document.querySelector(location.hash);
    if (target) {
      target.classList.add("is-target");
      target.scrollIntoView({ block: "center" });
    }
  }
})();
