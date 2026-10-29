/*
 * master-order.js — serves the Master Order lookups from data/masterOrders.json
 * (static file on GitHub Pages) instead of a slow Apps Script + Google Sheet call.
 *
 * Handles the same four actions the modules already send to their backend:
 *   listSbus, listBuyers, listIrs, getOrderDetail
 * and returns the same response shapes. If the JSON cannot be loaded, handle()
 * returns null and the module falls back to its normal Apps Script call.
 *
 * To update the data: replace data/masterOrders.json (primary) and/or data/masterOrders2.json
 * (fallback for styles that are not in the primary file) in the repo.
 */
(function () {
  var URL = "data/masterOrders.json";
  var URL2 = "data/masterOrders2.json"; // fallback: used only for IRs missing from file 1
  var URL3 = "data/sbuOverride.json";   // { "IR No": "Production SBU" } for IRs produced in a different SBU than allocated
  var ACTIONS = { listSbus: 1, listBuyers: 1, listIrs: 1, getOrderDetail: 1, listBuyersOther: 1, listIrsOther: 1 };
  var loading = null;

  function norm(v) { return v === null || v === undefined ? "" : String(v).trim(); }

  // Preferred source: the signed-in-only backend endpoint (files kept private in Drive).
  // Fallback: the static file in the repo (used until the Drive files are configured).
  var MASTER_API_URL = "https://script.google.com/macros/s/AKfycbzZ2Kn-5XlYWyJL2x9eYwtuQwm9dWNX8okS47B4Bjh8OcMQkMhwuZEJapfPaW68ZVIZ/exec";
  var raw = null;

  function whenToken() {
    return new Promise(function (resolve) {
      var n = 0;
      (function check() {
        if (window.tcPickToken && window.tcPickToken()) return resolve(true);
        if (++n > 240) return resolve(false);   // ~2 minutes, then use the static fallback
        setTimeout(check, 500);
      })();
    });
  }

  function getJson(u, name) {
    return whenToken().then(function (ok) {
      if (!ok) return null;
      return fetch(MASTER_API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "masterFile", name: name }) })
        .then(function (r) { return r.json(); })
        .then(function (d) { return d && !d.error && d.ok !== false ? d : null; })
        .catch(function () { return null; });
    }).then(function (d) {
      if (d) return d;
      return fetch(u, { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    });
  }

  // File 1 (masterOrders.json) is the primary source. File 2 (masterOrders2.json) is only
  // used for IRs that file 1 does not have at all, so file 1 always wins when both have an IR.
  function load() {
    if (loading) return loading;
    // cache:"no-cache" = browser asks GitHub "changed?" and gets a tiny 304 when not,
    // so data is always fresh but repeat visits cost almost nothing.
    loading = Promise.all([getJson(URL, "orders1").catch(function () { return null; }), getJson(URL2, "orders2").catch(function () { return null; }), getJson(URL3, "override").catch(function () { return {}; })])
      .then(function (res) {
        raw = res;
        var a = res[0], b = res[1], ov = res[2] || {};
        if (!a && !b) throw new Error("no local master order data");
        var rows1 = (a && a.data) || [], rows2 = (b && b.data) || [];
        var have = {};
        rows1.forEach(function (r) { have[norm(r["IR No"])] = 1; });
        var extra = rows2.filter(function (r) { return !have[norm(r["IR No"])]; });
        var rows = rows1.concat(extra).map(function (r) {
          var p = ov[norm(r["IR No"])];
          p = norm(p);
          if (!p || p === norm(r["SBU"])) return r;
          var c = {}; for (var k in r) c[k] = r[k];
          c["Allocated SBU"] = r["SBU"]; c["SBU"] = p;   // production SBU wins; allocation is kept for display
          return c;
        });
        var groups = {};
        rows.forEach(function (r) {
          var k = norm(r["SBU"]) + "\u0001" + norm(r["Buyer"]) + "\u0001" + norm(r["IR No"]);
          (groups[k] = groups[k] || []).push(r);
        });
        return { rows: rows.filter(function (r) { return norm(r["SBU"]); }), groups: groups, updated: (a || b).updated, fromFile2: extra.length };
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

  // "Other SBU" lookups: let an inspector pick a Buyer / IR that is allocated to a different SBU
  // than the one they are working in. The entry keeps the SBU they selected (the production SBU).
  function otherBuyers(db, sbu) {
    if (!sbu) return [];
    var own = {}, map = {};
    db.rows.forEach(function (r) { if (norm(r["SBU"]) === sbu) own[norm(r["Buyer"])] = 1; });
    db.rows.forEach(function (r) { var b = norm(r["Buyer"]); if (b && !own[b]) (map[b] = map[b] || {})[norm(r["SBU"])] = 1; });
    return Object.keys(map).sort().map(function (b) { return { value: b, label: b + " \u2014 " + Object.keys(map[b]).sort().join(", ") }; });
  }
  function otherIrs(db, sbu, buyer) {
    if (!sbu || !buyer) return [];
    var map = {};
    db.rows.forEach(function (r) {
      if (norm(r["Buyer"]) !== buyer || norm(r["SBU"]) === sbu) return;
      var ir = norm(r["IR No"]); if (ir) (map[ir] = map[ir] || {})[norm(r["SBU"])] = 1;
    });
    return Object.keys(map).sort().map(function (ir) { return { value: ir, label: ir + " \u2014 " + Object.keys(map[ir]).sort().join(", ") }; });
  }

  // flavor "ra" keeps Risk Assessment's detail shape (embCat filter + embCats list);
  // anything else returns the QA / inspection shape.
  function detail(db, p, flavor) {
    var sbu = norm(p.sbu), buyer = norm(p.buyer), ir = norm(p.ir), emb = norm(p.embCat);
    var rows = db.groups[sbu + "\u0001" + buyer + "\u0001" + ir] || [], fromOther = "";
    if (!rows.length && sbu && buyer && ir) {   // IR is allocated to another SBU: look it up there, keep the chosen SBU as production SBU
      rows = db.rows.filter(function (r) { return norm(r["Buyer"]) === buyer && norm(r["IR No"]) === ir; });
      if (rows.length) fromOther = norm(rows[0]["SBU"]);
    }
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
      base.sbu = fromOther ? sbu : norm(first["SBU"]); base.buyer = norm(first["Buyer"]); base.ir = norm(first["IR No"]);
      base.embellishmentCategory = first["Embellishment Category"];
      base.shipDate = norm(first["Ship Date"]); base.lineCount = rows.length;
      base.allocatedSbu = fromOther || norm(first["Allocated SBU"]);
    }
    return base;
  }

  window.MasterOrder = {
    handles: function (action) { return !!ACTIONS[action]; },
    preload: load,
    files: function () { return load().then(function () { return raw || [null, null, {}]; }); },
    handle: function (p, flavor) {
      return load().then(function (db) {
        if (!db) return null;
        switch (p.action) {
          case "listSbus":   return { ok: true, sbus: distinct(db.rows, "SBU", {}) };
          case "listBuyers": return { ok: true, buyers: distinct(db.rows, "Buyer", { SBU: p.sbu }) };
          case "listIrs":    return { ok: true, irs: distinct(db.rows, "IR No", { SBU: p.sbu, Buyer: p.buyer }) };
          case "listBuyersOther": return { ok: true, buyers: otherBuyers(db, norm(p.sbu)) };
          case "listIrsOther":    return { ok: true, irs: otherIrs(db, norm(p.sbu), norm(p.buyer)) };
          case "getOrderDetail": return { ok: true, detail: detail(db, p, flavor) };
        }
        return null;
      });
    }
  };
  load(); // start downloading as soon as the page opens
})();
