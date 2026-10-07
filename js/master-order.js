/*
 * master-order.js — serves the Master Order lookups from data/masterOrders.json
 * (static file on GitHub Pages) instead of a slow Apps Script + Google Sheet call.
 *
 * Handles the same four actions the modules already send to their backend:
 *   listSbus, listBuyers, listIrs, getOrderDetail
 * and returns the same response shapes. If the JSON cannot be loaded, handle()
 * returns null and the module falls back to its normal Apps Script call.
 *
 * To update the data: replace data/masterOrders.json in the repo.
 */
(function () {
  var URL = "data/masterOrders.json";
  var ACTIONS = { listSbus: 1, listBuyers: 1, listIrs: 1, getOrderDetail: 1 };
  var loading = null;

  function norm(v) { return v === null || v === undefined ? "" : String(v).trim(); }

  function load() {
    if (loading) return loading;
    // cache:"no-cache" = browser asks GitHub "changed?" and gets a tiny 304 when not,
    // so data is always fresh but repeat visits cost almost nothing.
    loading = fetch(URL, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        var rows = (j && j.data) || [];
        var groups = {};
        rows.forEach(function (r) {
          var k = norm(r["SBU"]) + "\u0001" + norm(r["Buyer"]) + "\u0001" + norm(r["IR No"]);
          (groups[k] = groups[k] || []).push(r);
        });
        return { rows: rows.filter(function (r) { return norm(r["SBU"]); }), groups: groups, updated: j.updated };
      })
      .catch(function (e) { loading = null; console.warn("[MasterOrder] local data unavailable, using backend:", e); return null; });
    return loading;
  }

  function distinct(rows, col, filters) {
    var set = {};
    rows.forEach(function (r) {
      for (var f in filters) {
        var want = norm(filters[f]);
        if (want && norm(r[f]) !== want) return;
      }
      var v = norm(r[col]);
      if (v) set[v] = true;
    });
    return Object.keys(set).sort();
  }

  // flavor "ra" keeps Risk Assessment's detail shape (embCat filter + embCats list);
  // anything else returns the QA / inspection shape.
  function detail(db, p, flavor) {
    var sbu = norm(p.sbu), buyer = norm(p.buyer), ir = norm(p.ir), emb = norm(p.embCat);
    var rows = db.groups[sbu + "\u0001" + buyer + "\u0001" + ir] || [];
    if (flavor === "ra" && emb) rows = rows.filter(function (r) { return norm(r["Embellishment Category"]) === emb; });
    if (!rows.length) return null;
    var first = rows[0], colorMap = {}, order = [], total = 0, embSet = {};
    rows.forEach(function (r) {
      var c = norm(r["Color"]) || "\u2014", q = Number(r["Total"]) || 0;
      if (!(c in colorMap)) { colorMap[c] = 0; order.push(c); }
      colorMap[c] += q; total += q;
      var e = norm(r["Embellishment Category"]); if (e) embSet[e] = true;
    });
    var colors = order.map(function (c) { return { color: c, qty: colorMap[c] }; });
    var base = {
      styleName: first["Style Name"], styleDescription: first["Style Description"], season: first["Season"],
      item: first["Item"], productDept: first["Product Dept"], colors: colors, totalQty: total
    };
    if (flavor === "ra") {
      var embCats = Object.keys(embSet).sort();
      base.embellishmentCategory = emb || embCats.join(", ");
      base.embCats = embCats;
    } else {
      base.sbu = norm(first["SBU"]); base.buyer = norm(first["Buyer"]); base.ir = norm(first["IR No"]);
      base.embellishmentCategory = first["Embellishment Category"];
      base.shipDate = norm(first["Ship Date"]); base.lineCount = rows.length;
    }
    return base;
  }

  window.MasterOrder = {
    handles: function (action) { return !!ACTIONS[action]; },
    preload: load,
    handle: function (p, flavor) {
      return load().then(function (db) {
        if (!db) return null;
        switch (p.action) {
          case "listSbus":   return { ok: true, sbus: distinct(db.rows, "SBU", {}) };
          case "listBuyers": return { ok: true, buyers: distinct(db.rows, "Buyer", { SBU: p.sbu }) };
          case "listIrs":    return { ok: true, irs: distinct(db.rows, "IR No", { SBU: p.sbu, Buyer: p.buyer }) };
          case "getOrderDetail": return { ok: true, detail: detail(db, p, flavor) };
        }
        return null;
      });
    }
  };
  load(); // start downloading as soon as the page opens
})();
