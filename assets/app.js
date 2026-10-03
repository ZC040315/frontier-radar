// 前沿雷达 · 首页逻辑
// 筛选（领域 / 层级 / 类型）+ 搜索 + 详情侧边面板 + 相关条目 + 本周新增标记
(function () {
  "use strict";

  var DATA = window.FRONTIER_DATA;
  if (!DATA) return;

  var domainLabel = {};
  DATA.domains.forEach(function (d) { domainLabel[d.id] = d.label; });
  var layerLabel = {};
  DATA.layers.forEach(function (l) { layerLabel[l.id] = l.label; });
  var typeLabel = {};
  DATA.types.forEach(function (t) { typeLabel[t.id] = t.label; });

  var byId = {};
  DATA.items.forEach(function (it) { byId[it.id] = it; });

  var state = { domain: "all", layer: "all", type: "all", q: "" };

  // ---------- 工具 ----------

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function weekStart(date) {
    var d = new Date(date.getTime());
    var shift = (d.getDay() + 6) % 7; // 周一为一周起点
    d.setDate(d.getDate() - shift);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isThisWeek(dateStr) {
    if (!dateStr) return false;
    var d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return false;
    var start = weekStart(new Date());
    var end = new Date(start.getTime());
    end.setDate(end.getDate() + 7);
    return d >= start && d < end;
  }

  function sortByDateDesc(list) {
    return list.slice().sort(function (a, b) {
      if (a.date === b.date) return a.id < b.id ? -1 : 1;
      return a.date < b.date ? 1 : -1;
    });
  }

  // ---------- 筛选 ----------

  function chipGroup(host, options, key) {
    host.innerHTML = "";
    [{ id: "all", label: "全部" }].concat(options).forEach(function (opt) {
      var btn = el("button", "chip" + (state[key] === opt.id ? " is-active" : ""), opt.label);
      btn.type = "button";
      btn.dataset.value = opt.id;
      btn.setAttribute("aria-pressed", state[key] === opt.id ? "true" : "false");
      btn.addEventListener("click", function () {
        state[key] = opt.id;
        Array.prototype.forEach.call(host.querySelectorAll(".chip"), function (c) {
          var on = c.dataset.value === opt.id;
          c.classList.toggle("is-active", on);
          c.setAttribute("aria-pressed", on ? "true" : "false");
        });
        render();
      });
      host.appendChild(btn);
    });
  }

  var feed = document.getElementById("feed");

  function matches(item) {
    if (state.domain !== "all" && item.domain !== state.domain) return false;
    if (state.layer !== "all" && item.layer !== state.layer) return false;
    if (state.type !== "all" && item.type !== state.type) return false;
    if (state.q) {
      var hay = [item.titleZh, item.titleOrig, item.what, item.why, item.org, item.tags.join(" ")]
        .join(" ")
        .toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
    }
    return true;
  }

  // ---------- 列表 ----------

  function externalIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 L17 7"></path><path d="M9 7 h8 v8"></path></svg>';
  }

  function renderRow(item, index) {
    var row = el("article", "row" + (isThisWeek(item.added) ? " row--new" : ""));
    row.dataset.id = item.id;

    var rail = el("div", "row-rail");
    rail.appendChild(el("span", "row-index", String(index + 1).padStart(3, "0")));
    rail.appendChild(el("time", "row-date", item.date));
    rail.appendChild(el("span", "row-type", typeLabel[item.type] || item.type));
    row.appendChild(rail);

    var body = el("div", "row-body");

    var openBtn = el("button", "row-open");
    openBtn.type = "button";
    openBtn.setAttribute("aria-label", "展开详情：" + item.titleZh);
    var titleWrap = el("span", "row-title-wrap");
    titleWrap.appendChild(el("span", "row-title", item.titleZh));
    if (isThisWeek(item.added)) titleWrap.appendChild(el("span", "badge-new", "本周新增"));
    openBtn.appendChild(titleWrap);
    body.appendChild(openBtn);

    body.appendChild(el("p", "row-orig", item.titleOrig));
    body.appendChild(el("p", "row-what", item.what));

    var why = el("div", "row-why");
    why.appendChild(el("span", "why-label", "为什么重要"));
    why.appendChild(el("p", "why-text", item.why));
    body.appendChild(why);

    var tags = el("ul", "row-tags");
    item.tags.forEach(function (t) { tags.appendChild(el("li", "tag", "#" + t)); });
    body.appendChild(tags);
    row.appendChild(body);

    var side = el("div", "row-side");
    side.appendChild(el("span", "side-domain", domainLabel[item.domain] || item.domain));
    side.appendChild(el("span", "side-org", item.org));
    var foot = el("div", "side-foot");
    foot.appendChild(el("span", "side-layer", layerLabel[item.layer] || item.layer));
    var a = el("a", "side-link");
    a.href = item.link;
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", "打开原文：" + item.titleZh);
    a.innerHTML = externalIcon();
    foot.appendChild(a);
    side.appendChild(foot);
    row.appendChild(side);

    row.addEventListener("click", function (ev) {
      if (ev.target.closest("a")) return;
      openPanel(item.id);
    });

    return row;
  }

  function render() {
    var list = sortByDateDesc(DATA.items.filter(matches));
    feed.innerHTML = "";

    if (!list.length) {
      var empty = el("div", "empty");
      empty.appendChild(el("p", "empty-title", "没有符合条件的内容"));
      empty.appendChild(el("p", "empty-hint", "换个筛选条件，或者清空搜索词。"));
      feed.appendChild(empty);
    } else {
      list.forEach(function (item, i) { feed.appendChild(renderRow(item, i)); });
    }

    document.getElementById("resultCount").textContent = String(list.length);
  }

  // ---------- 详情面板 ----------

  var panel = document.getElementById("panel");
  var panelBody = document.getElementById("panelBody");
  var lastFocus = null;

  function metaRow(label, value) {
    var wrap = el("div", "pm-item");
    wrap.appendChild(el("span", "pm-label", label));
    wrap.appendChild(el("span", "pm-value", value));
    return wrap;
  }

  function renderPanel(item) {
    panelBody.innerHTML = "";

    var head = el("div", "panel-head");
    head.appendChild(el("p", "panel-kicker",
      (domainLabel[item.domain] || item.domain) + " · " + (typeLabel[item.type] || item.type)));
    head.appendChild(el("h2", "panel-title", item.titleZh));
    head.appendChild(el("p", "panel-orig", item.titleOrig));
    panelBody.appendChild(head);

    var meta = el("div", "panel-meta");
    meta.appendChild(metaRow("时间", item.date));
    meta.appendChild(metaRow("机构", item.org));
    meta.appendChild(metaRow("层级", layerLabel[item.layer] || item.layer));
    meta.appendChild(metaRow("领域", domainLabel[item.domain] || item.domain));
    panelBody.appendChild(meta);

    var whatWrap = el("section", "panel-block");
    whatWrap.appendChild(el("h3", "panel-block-title", "一句话是什么"));
    whatWrap.appendChild(el("p", null, item.what));
    panelBody.appendChild(whatWrap);

    var whyWrap = el("section", "panel-block panel-block--why");
    whyWrap.appendChild(el("h3", "panel-block-title", "为什么值得你知道"));
    whyWrap.appendChild(el("p", null, item.why));
    panelBody.appendChild(whyWrap);

    if (item.tags && item.tags.length) {
      var tagWrap = el("section", "panel-block");
      tagWrap.appendChild(el("h3", "panel-block-title", "标签"));
      var ul = el("ul", "panel-tags");
      item.tags.forEach(function (t) { ul.appendChild(el("li", "tag", "#" + t)); });
      tagWrap.appendChild(ul);
      panelBody.appendChild(tagWrap);
    }

    var related = (item.related || []).map(function (id) { return byId[id]; }).filter(Boolean);
    if (related.length) {
      var relWrap = el("section", "panel-block");
      relWrap.appendChild(el("h3", "panel-block-title", "相关条目"));
      var relList = el("ul", "panel-related");
      related.forEach(function (r) {
        var li = el("li");
        var btn = el("button", "panel-related-btn");
        btn.type = "button";
        btn.appendChild(el("span", "pr-title", r.titleZh));
        btn.appendChild(el("span", "pr-meta", (domainLabel[r.domain] || r.domain) + " · " + r.date));
        btn.addEventListener("click", function () {
          openPanel(r.id);
          panelBody.scrollTop = 0;
        });
        li.appendChild(btn);
        relList.appendChild(li);
      });
      relWrap.appendChild(relList);
      panelBody.appendChild(relWrap);
    }

    var actions = el("div", "panel-actions");
    var go = el("a", "btn-original", "打开原文");
    go.href = item.link;
    go.target = "_blank";
    go.rel = "noopener";
    actions.appendChild(go);
    panelBody.appendChild(actions);

    var note = el("p", "panel-note", "内容与日期以原文为准；本条链接已在 2026-10-03 核实可打开。");
    panelBody.appendChild(note);
  }

  function openPanel(id, pushHash) {
    var item = byId[id];
    if (!item || !panel) return;
    lastFocus = document.activeElement;
    renderPanel(item);
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("panel-open");
    panelBody.scrollTop = 0;
    var closeBtn = panel.querySelector(".panel-close");
    if (closeBtn) closeBtn.focus();
    if (pushHash !== false && location.hash !== "#item-" + id) {
      history.pushState(null, "", "#item-" + id);
    }
  }

  function closePanel(pushHash) {
    if (!panel) return;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("panel-open");
    if (pushHash !== false && /^#item-/.test(location.hash)) {
      history.pushState(null, "", location.pathname + location.search);
    }
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  if (panel) {
    var closeBtn = panel.querySelector(".panel-close");
    if (closeBtn) closeBtn.addEventListener("click", function () { closePanel(); });
    var scrim = panel.querySelector(".panel-scrim");
    if (scrim) scrim.addEventListener("click", function () { closePanel(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("is-open")) closePanel();
    });
  }

  function openFromHash() {
    var m = /^#item-(.+)$/.exec(location.hash);
    if (m && byId[m[1]]) openPanel(m[1], false);
    else closePanel(false);
  }

  window.addEventListener("hashchange", openFromHash);

  // ---------- 首屏数字与筛选初始化 ----------

  var weekNew = DATA.items.filter(function (it) { return isThisWeek(it.added); }).length;
  document.getElementById("heroCount").textContent = String(DATA.items.length);
  var footCount = document.getElementById("footCount");
  if (footCount) footCount.textContent = String(DATA.items.length);
  var weekEl = document.getElementById("heroNew");
  if (weekEl) {
    weekEl.textContent = weekNew > 0 ? "本周新增 " + weekNew + " 条" : "本周无新增";
  }

  chipGroup(document.getElementById("domainChips"), DATA.domains, "domain");
  chipGroup(document.getElementById("layerChips"), DATA.layers, "layer");
  chipGroup(document.getElementById("typeChips"), DATA.types, "type");

  document.getElementById("search").addEventListener("input", function (e) {
    state.q = e.target.value.trim();
    render();
  });

  render();
  openFromHash();
})();
