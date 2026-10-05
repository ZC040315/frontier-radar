// 前沿雷达 · 每日自动收录的渲染
// 首页显示「过去 24 小时」，daily.html 显示近 7 天按天分组。
// 这里只负责展示采集到的原文事实，不做任何转述或评价。
(function () {
  "use strict";

  var DATA = window.FRONTIER_DAILY;
  var band = document.getElementById("dailyBand");
  var full = document.getElementById("dailyFull");
  if (!DATA || (!band && !full)) return;

  var DOMAIN_LABEL = {
    med: "医疗健康",
    ai: "AI 与智能体",
    prod: "数字产品与交互",
    infra: "交叉与基础设施",
  };

  var KIND_LABEL = {
    paper: "论文",
    product: "产品",
    news: "报道",
    discussion: "讨论",
  };

  var CATEGORY_LABEL = {};
  var CATEGORY_DESC = {};
  (window.FRONTIER_CATEGORIES || []).forEach(function (c) {
    CATEGORY_LABEL[c.id] = c.label;
    CATEGORY_DESC[c.id] = c.desc;
  });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function localDate(iso) {
    var d = new Date(iso);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function hm(iso) {
    var d = new Date(iso);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function dayLabel(dateStr) {
    var today = localDate(new Date().toISOString());
    var y = new Date();
    y.setDate(y.getDate() - 1);
    if (dateStr === today) return "今天";
    if (dateStr === localDate(y.toISOString())) return "昨天";
    var d = new Date(dateStr + "T00:00:00");
    var week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
    return d.getMonth() + 1 + " 月 " + d.getDate() + " 日 · " + week;
  }

  function row(item, showTime) {
    var li = el("li", "daily-row");

    if (showTime) {
      var t = el("time", "daily-time", hm(item.published));
      t.dateTime = item.published;
      li.appendChild(t);
    }

    var body = el("div", "daily-body");
    var a = el("a", "daily-title", item.title);
    a.href = item.url;
    a.target = "_blank";
    a.rel = "noopener";
    body.appendChild(a);
    if (item.summary) body.appendChild(el("p", "daily-summary", item.summary));
    li.appendChild(body);

    // 元信息固定两行、左对齐：第一行「来源 · 类型」，第二行「领域 · 类别」。
    // 不要右对齐 + 自动换行——那样每行的左边缘都会跳，整列看起来是歪的。
    var meta = el("div", "daily-meta");

    var line1 = el("span", "daily-meta-line");
    line1.appendChild(el("span", "daily-source", item.source));
    line1.appendChild(el("span", "daily-kind", KIND_LABEL[item.kind] || item.kind));
    if (item.score) line1.appendChild(el("span", "daily-score", item.score + " 分"));
    meta.appendChild(line1);

    var line2 = el("span", "daily-meta-line");
    line2.appendChild(el("span", "daily-domain", DOMAIN_LABEL[item.domain] || item.domain));
    if (item.category) {
      var cat = el("span", "daily-category", CATEGORY_LABEL[item.category] || item.category);
      cat.title = CATEGORY_DESC[item.category] || "";
      line2.appendChild(cat);
    }
    meta.appendChild(line2);
    li.appendChild(meta);

    return li;
  }

  var items = Array.isArray(DATA.items) ? DATA.items.slice() : [];
  items.sort(function (a, b) { return a.published < b.published ? 1 : -1; });

  var since = new Date(DATA.last24hSince || DATA.generatedAt || Date.now());
  var last24 = items.filter(function (i) { return new Date(i.published) >= since; });
  // 首页只铺几条：24 小时区块是「快速扫一眼」，不是第二个列表；
  // 手机上屏幕更窄，收得更狠，免得把正式内容压到第三屏以后。
  var HOME_LIMIT = window.innerWidth <= 940 ? 3 : 5;

  // ---------- 首页：过去 24 小时 ----------
  if (band) {
    var list = band.querySelector(".daily-list");
    var sub = band.querySelector("[data-daily-sub]");
    var more = band.querySelector("[data-daily-more]");
    var shown = last24.slice(0, HOME_LIMIT);
    var rest = last24.length - shown.length;

    if (sub) {
      sub.textContent =
        "每天早上 8:00 自动抓取 · 数据生成于 " +
        hm(DATA.generatedAt) +
        " · 近 7 天共 " +
        items.length +
        " 条";
    }
    if (more) {
      more.textContent = "看近 7 天全部（" + items.length + " 条）→";
    }

    if (!last24.length) {
      var empty = el("li", "daily-empty");
      empty.appendChild(el("span", null, "过去 24 小时没有抓到新的前沿线索。"));
      empty.appendChild(
        el("span", "daily-empty-hint", "自动抓取只收原文里的事实，宁缺毋滥——近 7 天的记录仍然在。")
      );
      list.appendChild(empty);
    } else {
      shown.forEach(function (item) { list.appendChild(row(item, true)); });
      if (rest > 0) {
        var moreLi = el("li", "daily-more-row");
        var moreLink = el("a", null, "还有 " + rest + " 条 24 小时内的线索 →");
        moreLink.href = "daily.html";
        moreLi.appendChild(moreLink);
        list.appendChild(moreLi);
      }
    }
    band.hidden = false;
  }

  // ---------- daily.html：近 7 天按天分组 ----------
  if (full) {
    var host = full.querySelector(".daily-days");
    var head = document.querySelector("[data-daily-head]");
    if (head) {
      head.textContent =
        "数据生成于 " + DATA.generatedAt.replace("T", " ").slice(0, 16) + "（UTC）" +
        " · 共 " + items.length + " 条 · 其中过去 24 小时 " + last24.length + " 条";
    }

    if (!items.length) {
      host.appendChild(el("p", "daily-empty", "还没有抓取记录，等下一个 08:00。"));
    } else {
      var groups = {};
      items.forEach(function (item) {
        var key = localDate(item.published);
        (groups[key] = groups[key] || []).push(item);
      });
      Object.keys(groups)
        .sort()
        .reverse()
        .forEach(function (key) {
          var section = el("section", "daily-day");
          var h = el("h2", "daily-day-title");
          h.appendChild(el("span", null, dayLabel(key)));
          h.appendChild(el("span", "daily-day-count", groups[key].length + " 条"));
          section.appendChild(h);
          var ul = el("ul", "daily-list");
          groups[key].forEach(function (item) { ul.appendChild(row(item, true)); });
          section.appendChild(ul);
          host.appendChild(section);
        });
    }
    full.hidden = false;
  }
})();
