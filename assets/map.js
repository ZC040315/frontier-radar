(function () {
  "use strict";

  var MAP = window.FRONTIER_MAP;
  var DATA = window.FRONTIER_DATA;
  var host = document.getElementById("map");
  if (!MAP || !DATA || !host) return;

  var byId = {};
  DATA.items.forEach(function (it) { byId[it.id] = it; });

  var typeLabel = {};
  DATA.types.forEach(function (t) { typeLabel[t.id] = t.label; });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function itemList(ids) {
    var ul = el("ul", "node-items");
    ids.forEach(function (id) {
      var item = byId[id];
      if (!item) return;
      var li = el("li");
      var a = el("a", "ni-title", item.titleZh);
      a.href = "index.html#item-" + item.id;
      li.appendChild(a);
      li.appendChild(el("span", "ni-meta", typeLabel[item.type] + " · " + item.date));
      var ext = el("a", "ni-ext");
      ext.href = item.link;
      ext.target = "_blank";
      ext.rel = "noopener";
      ext.setAttribute("aria-label", "打开原文：" + item.titleZh);
      ext.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 L17 7"></path><path d="M9 7 h8 v8"></path></svg>';
      li.appendChild(ext);
      ul.appendChild(li);
    });
    return ul;
  }

  function renderNode(node) {
    var count = node.items.length;

    if (!count) {
      var blank = el("div", "node node--empty");
      var line = el("div");
      line.appendChild(el("span", "node-label", node.label));
      line.appendChild(el("span", "node-problem", node.problem));
      line.appendChild(el("span", "node-count", "待补"));
      blank.appendChild(line);
      return blank;
    }

    var det = el("details", "node");
    var sum = el("summary");
    sum.appendChild(el("span", "node-label", node.label));
    sum.appendChild(el("span", "node-problem", node.problem));
    sum.appendChild(el("span", "node-count", count + " 条"));
    det.appendChild(sum);
    det.appendChild(itemList(node.items));
    return det;
  }

  var filled = 0;
  var total = 0;

  MAP.forEach(function (domain) {
    var section = el("section", "domain");
    section.id = "domain-" + domain.domain;

    var head = el("div", "domain-head");
    head.appendChild(el("h2", null, domain.label));
    head.appendChild(el("p", "domain-note", domain.note));
    section.appendChild(head);

    domain.groups.forEach(function (group, gi) {
      var box = el("div", "group");
      if (group.label) box.appendChild(el("h3", "group-label", group.label));
      else if (gi > 0) box.appendChild(el("h3", "group-label", "\u00A0"));
      group.nodes.forEach(function (node) {
        total += 1;
        if (node.items.length) filled += 1;
        box.appendChild(renderNode(node));
      });
      section.appendChild(box);
    });

    host.appendChild(section);
  });

  var filledEl = document.getElementById("filledNodes");
  var totalEl = document.getElementById("totalNodes");
  if (filledEl) filledEl.textContent = String(filled);
  if (totalEl) totalEl.textContent = String(total);
})();
