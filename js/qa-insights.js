/*
 * qa-insights.js — Style Tracking + Inspector Dashboard for the QA Inspection page.
 * Reads the reports the six inspection pages already save (same backend), so
 * no new backend action is needed. Public API: QAInsights.render(tabId, el)
 *   tabId: "styletracking" | "dashboard"
 */
(function () {
  "use strict";
  var API = "https://script.google.com/macros/s/AKfycbzZ2Kn-5XlYWyJL2x9eYwtuQwm9dWNX8okS47B4Bjh8OcMQkMhwuZEJapfPaW68ZVIZ/exec";

  var TYPES = [
    { key: "1st Bundle", page: "1st-bundle-inspection.html", action: "list1stBundle", name: "1st Bundle Inspection" },
    { key: "Sewing Inline", page: "sewing-inline-inspection.html", action: "listSewingInline", name: "Sewing Inline Inspection" },
    { key: "Finishing Inline", page: "finishing-inline-inspection.html", action: "listFinishingInline", name: "Finishing Inline Inspection" },
    { key: "1st Carton", page: "1st-carton-inspection.html", action: "list1stCarton", name: "1st Carton Inspection" },
    { key: "Pre-Final", page: "pre-final-inspection.html", action: "listPreFinal", name: "Pre-Final Inspection" },
    { key: "Final", page: "final-inspection.html", action: "listFinal", name: "Final Inspection" }
  ];
  // Process order requested by the user. "doc" stages are read from the
  // Documents Review checklist inside the 1st Bundle report.
  var STAGES = [
    { label: "Style File", doc: "Style File Review" },
    { label: "Risk Assessment", doc: "Risk Assessment Review" },
    { label: "Techpack", doc: "Tech Pack Review" },
    { label: "PP Meeting", doc: "PP Meeting Review" },
    { label: "Size Set", doc: "Size Set Approval Review" },
    { label: "1st Bundle", type: "1st Bundle" },
    { label: "Sewing Inline", type: "Sewing Inline" },
    { label: "Testing", testing: true },
    { label: "Finishing Inline", type: "Finishing Inline" },
    { label: "1st Carton", type: "1st Carton" },
    { label: "Pre-Final", type: "Pre-Final" },
    { label: "Final Inspection", type: "Final" }
  ];

  var cache = null, charts = [];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function norm(v) { return v == null ? "" : String(v).trim(); }
  function normDate(d) {
    d = norm(d);
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    var t = new Date(d);
    if (isNaN(t)) return "";
    return t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2);
  }
  function post(p) {
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 25000);
    return fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p), signal: c.signal })
      .then(function (r) { return r.json(); })
      .finally(function () { clearTimeout(t); });
  }

  function outcomeOf(r) {
    if (/draft/i.test(norm(r.status))) return "Draft";
    var d = norm(r.decision);
    if (/reject/i.test(d)) return "Fail";
    if (/rework/i.test(d)) return "Rework";
    if (/accept/i.test(d)) return "Pass";
    var x = norm(r.result).toUpperCase();
    if (x === "PASS") return "Pass";
    if (x === "FAIL") return "Fail";
    return "Done";
  }

  function loadAll(force) {
    if (cache && !force) return Promise.resolve(cache);
    var jobs = TYPES.map(function (t) {
      return post({ action: t.action })
        .then(function (r) { if (!r.ok) throw new Error(r.error || "failed"); return { t: t, rows: r.reports || [] }; })
        .catch(function (e) { return { t: t, err: e.message || "failed" }; });
    });
    jobs.push(post({ action: "listTesting" })
      .then(function (r) { if (!r.ok) throw new Error(r.error || "failed"); return { testing: r.entries || [] }; })
      .catch(function (e) { return { testing: [], err: e.message || "failed", label: "Testing" }; }));
    return Promise.all(jobs).then(function (res) {
      var data = { recs: [], testing: [], failed: [] };
      res.forEach(function (x) {
        if (x.err) data.failed.push(x.t ? x.t.key : x.label);
        if (x.testing) { data.testing = x.testing; return; }
        (x.rows || []).forEach(function (r) {
          var h = r.header || {};
          if (h.inspectionType && h.inspectionType !== x.t.name) return;
          data.recs.push({
            type: x.t.key, ir: norm(h.ir), sbu: norm(h.sbu), buyer: norm(h.buyer), style: norm(h.styleName),
            id: r.id || "", page: x.t.page, decision: norm(r.decision), date: normDate(h.date), inspector: norm(h.inspectorName) || "(not entered)", outcome: outcomeOf(r), r: r
          });
        });
      });
      cache = data;
      return data;
    });
  }

  // ---------------- Style Tracking logic ----------------
  function tracking(data, ir) {
    ir = norm(ir);
    var mine = data.recs.filter(function (x) { return x.ir === ir && x.outcome !== "Draft"; });
    function latest(type) {
      var l = mine.filter(function (x) { return x.type === type; });
      l.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      return { last: l[0] || null, count: l.length };
    }
    return STAGES.map(function (s) {
      if (s.doc) {
        var b = latest("1st Bundle").last;
        if (!b) return { s: s, status: "Pending", note: "Read from the 1st Bundle report" };
        var it = (b.r.checklist || []).filter(function (c) { return c.label === s.doc; })[0];
        var v = it ? norm(it.status) : "";
        return { s: s, status: v === "Yes" ? "Done" : v === "No" ? "Issue" : v === "N/A" ? "N/A" : "Pending",
          rec: b, date: b.date, inspector: b.inspector, note: (it && it.comments) || (v ? "Marked " + v : "Not marked in 1st Bundle") };
      }
      if (s.testing) {
        var t = data.testing.filter(function (x) { return norm(x.ir) === ir; });
        if (!t.length) return { s: s, status: "Pending" };
        var lt = t[0], res = norm(lt.result);
        return { s: s, status: /fail|reject/i.test(res) ? "Issue" : /pass|approv/i.test(res) ? "Done" : "In Progress",
          date: normDate(lt.logOutDate || lt.logInDate), inspector: norm(lt.testedParty), note: t.length + " test(s)" + (res ? " — " + res : "") };
      }
      var L = latest(s.type);
      if (!L.last) return { s: s, status: "Pending" };
      var map = { Pass: "Done", Fail: "Issue", Rework: "In Progress", Done: "Done" };
      return { s: s, status: map[L.last.outcome] || "Done", rec: L.last, date: L.last.date, inspector: L.last.inspector,
        note: L.last.outcome + (L.count > 1 ? " (" + L.count + " reports)" : "") };
    });
  }

  // ---------------- Dashboard logic ----------------
  function aggregate(recs, f) {
    var rows = recs.filter(function (x) {
      return x.outcome !== "Draft" && x.date &&
        (!f.from || x.date >= f.from) && (!f.to || x.date <= f.to) &&
        (!f.buyer || x.buyer === f.buyer) && (!f.insp || x.inspector === f.insp) && (!f.type || x.type === f.type);
    });
    var out = { rows: rows, byDay: {}, byMonth: {}, byBuyer: {}, byInsp: {}, matrix: {}, styles: {} };
    rows.forEach(function (x) {
      out.byDay[x.date] = (out.byDay[x.date] || 0) + 1;
      var m = x.date.slice(0, 7);
      out.byMonth[m] = out.byMonth[m] || {};
      (out.byMonth[m][x.type] = out.byMonth[m][x.type] || {})[x.ir] = 1;
      out.styles[x.ir] = 1;
      [["byBuyer", x.buyer || "(none)"], ["byInsp", x.inspector]].forEach(function (p) {
        var o = out[p[0]][p[1]] = out[p[0]][p[1]] || { n: 0, pass: 0, judged: 0, set: {}, types: {} };
        o.n++; o.set[x.ir] = 1; o.types[x.type] = (o.types[x.type] || 0) + 1;
        if (x.outcome === "Pass") { o.pass++; o.judged++; } else if (x.outcome === "Fail" || x.outcome === "Rework") o.judged++;
      });
      var b = x.buyer || "(none)";
      out.matrix[b] = out.matrix[b] || {};
      out.matrix[b][x.inspector] = (out.matrix[b][x.inspector] || 0) + 1;
    });
    return out;
  }

  // ---------------- UI ----------------
  function injectCss() {
    if (document.getElementById("qx-css")) return;
    var s = document.createElement("style"); s.id = "qx-css";
    s.textContent =
      ".qx h1{font-size:24px;margin-bottom:6px}.qx .sub{color:var(--ink-soft);font-size:13px;margin-bottom:18px}" +
      ".qx-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:16px}" +
      ".qx-card{background:var(--card);border:1.5px solid var(--ink);border-radius:5px;padding:14px 16px;margin-bottom:16px}.qx-grid .qx-card{margin:0}" +
      ".qx-kpi b{display:block;font-size:26px;font-family:var(--display)}.qx-kpi span,.qx label{font:10.5px var(--mono);text-transform:uppercase;color:var(--ink-soft)}" +
      ".qx label{display:block;margin-bottom:4px}.qx select,.qx input{padding:8px 10px;border:1.5px solid var(--line-strong);background:var(--paper);font:13px var(--body);border-radius:2px;max-width:100%;width:100%}" +
      ".qx table{width:100%;border-collapse:collapse;font-size:13px}.qx th{text-align:left;font:10.5px var(--mono);text-transform:uppercase;color:var(--ink-soft);border-bottom:1.5px solid var(--ink);padding:7px 8px;white-space:nowrap}.qx td{padding:7px 8px;border-bottom:1px solid var(--line)}" +
      ".qx-chip{display:inline-block;padding:2px 9px;border-radius:10px;font:11px var(--mono);text-transform:uppercase;white-space:nowrap}" +
      ".st-Done{background:var(--pass-dim);color:var(--pass)}.st-Issue{background:var(--reject-dim);color:var(--reject)}.st-InProgress{background:#f5e9c8;color:#7a5a00}.st-Pending,.st-NA{background:var(--line);color:var(--ink-soft)}" +
      ".qx-bar{height:8px;background:var(--line);border-radius:4px;overflow:hidden;margin-top:8px}.qx-bar i{display:block;height:100%;background:var(--pass)}" +
      ".qx-wrap{overflow-x:auto}.qx-filters{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.qx-chart{position:relative;height:260px}" +
      ".qx-warn{font:12.5px var(--mono);background:var(--reject-dim);color:var(--reject);border:1px solid var(--reject);padding:9px 12px;border-radius:2px;margin-bottom:14px}";
    document.head.appendChild(s);
  }
  function pdfLink(rec) {
    return rec && rec.id && rec.page ? '<a href="' + rec.page + "?pdf=" + encodeURIComponent(rec.id) + '" target="_blank" rel="noopener">PDF ↓</a>' : "—";
  }
  function warnHTML(data) {
    return data.failed.length ? '<div class="qx-warn">Could not load: ' + esc(data.failed.join(", ")) + ". Those stages show as Pending / have no counts. Check your connection and press Refresh.</div>" : "";
  }
  function opts(list, sel, blank) {
    return '<option value="">' + esc(blank) + "</option>" + list.map(function (v) { return '<option' + (v === sel ? " selected" : "") + ">" + esc(v) + "</option>"; }).join("");
  }
  function lookup(p) {
    if (!window.MasterOrder) return Promise.resolve(null);
    return MasterOrder.handle(p, "qa").then(function (r) { return r && r.ok ? r : null; }).catch(function () { return null; });
  }

  function renderTracking(el) {
    el.innerHTML = '<div class="qx"><h1>Style Tracking</h1><div class="sub">Select a style (SBU → Buyer → IR) to see every process stage in order.</div><div class="qx-card">Loading reports…</div></div>';
    loadAll().then(function (data) {
      var box = el.querySelector(".qx");
      box.innerHTML = '<h1>Style Tracking</h1><div class="sub">Select a style (SBU → Buyer → IR) to see every process stage in order.</div>' + warnHTML(data) +
        '<div class="qx-card"><div class="qx-filters"><div><label>SBU</label><select id="qxSbu"></select></div><div><label>Buyer</label><select id="qxBuyer"></select></div><div><label>IR No</label><select id="qxIr"></select></div>' +
        '<div style="align-self:end"><button class="btn btn-ghost" id="qxRef">↻ Refresh</button></div></div></div><div id="qxOut"></div>';
      var sbu = box.querySelector("#qxSbu"), buyer = box.querySelector("#qxBuyer"), ir = box.querySelector("#qxIr"), out = box.querySelector("#qxOut");
      function show() {
        if (!ir.value) { out.innerHTML = ""; return; }
        var rows = tracking(data, ir.value), done = rows.filter(function (r) { return r.status === "Done"; }).length;
        var named = data.recs.filter(function (x) { return x.ir === norm(ir.value); })[0];
        out.innerHTML = '<div class="qx-card"><b>' + esc(ir.value) + "</b>" + (named && named.style ? " — " + esc(named.style) : "") +
          '<div style="font:12px var(--mono);color:var(--ink-soft);margin-top:4px">' + done + " of " + rows.length + ' stages complete</div><div class="qx-bar"><i style="width:' + Math.round(done / rows.length * 100) + '%"></i></div></div>' +
          '<div class="qx-card qx-wrap"><table><thead><tr><th>#</th><th>Stage</th><th>Status</th><th>Date</th><th>Inspector / Party</th><th>Details</th><th>Report</th></tr></thead><tbody>' +
          rows.map(function (r, i) {
            return "<tr><td>" + (i + 1) + "</td><td><b>" + esc(r.s.label) + '</b></td><td><span class="qx-chip st-' + r.status.replace(/[^A-Za-z]/g, "") + '">' + esc(r.status) + "</span></td><td>" +
              esc(r.date || "—") + "</td><td>" + esc(r.inspector || "—") + "</td><td>" + esc(r.note || "") + "</td><td>" + pdfLink(r.rec) + "</td></tr>";
          }).join("") + "</tbody></table></div>";
      }
      function fillIr(list) { ir.innerHTML = opts(list, "", "Select IR"); show(); }
      function fromData(f) { // fallback if Master Order lookup is unavailable: use IRs seen in reports
        return Object.keys(data.recs.filter(f).reduce(function (o, x) { if (x.ir) o[x.ir] = 1; return o; }, {})).sort();
      }
      lookup({ action: "listSbus" }).then(function (r) {
        sbu.innerHTML = opts(r ? r.sbus : Object.keys(data.recs.reduce(function (o, x) { if (x.sbu) o[x.sbu] = 1; return o; }, {})).sort(), "", "Select SBU");
      });
      sbu.onchange = function () {
        buyer.innerHTML = opts([], "", "Select Buyer"); fillIr([]);
        if (!sbu.value) return;
        lookup({ action: "listBuyers", sbu: sbu.value }).then(function (r) { buyer.innerHTML = opts(r ? r.buyers : [], "", "Select Buyer"); });
      };
      buyer.onchange = function () {
        fillIr([]);
        if (!buyer.value) return;
        lookup({ action: "listIrs", sbu: sbu.value, buyer: buyer.value }).then(function (r) {
          fillIr(r ? r.irs : fromData(function (x) { return x.sbu === sbu.value && x.buyer === buyer.value; }));
        });
      };
      ir.onchange = show;
      box.querySelector("#qxRef").onclick = function () { cache = null; renderTracking(el); };
      buyer.innerHTML = opts([], "", "Select Buyer"); ir.innerHTML = opts([], "", "Select IR");
    });
  }

  function destroyCharts() { charts.forEach(function (c) { try { c.destroy(); } catch (e) {} }); charts = []; }
  function mk(id, cfg) {
    var c = document.getElementById(id);
    if (!c || typeof Chart === "undefined") return;
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false }, cfg.options || {});
    charts.push(new Chart(c, cfg));
  }
  var PALETTE = ["#2f6e52", "#b8893a", "#3b6ea5", "#a5483b", "#6d5a9c", "#4d8f8f"];

  function renderDashboard(el) {
    destroyCharts();
    el.innerHTML = '<div class="qx"><h1>Inspector Dashboard</h1><div class="qx-card">Loading reports…</div></div>';
    loadAll().then(function (data) {
      var recs = data.recs.filter(function (x) { return x.outcome !== "Draft"; });
      var buyers = Object.keys(recs.reduce(function (o, x) { if (x.buyer) o[x.buyer] = 1; return o; }, {})).sort();
      var insps = Object.keys(recs.reduce(function (o, x) { o[x.inspector] = 1; return o; }, {})).sort();
      var today = new Date(), ymd = function (d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); };
      var f = { from: ymd(new Date(today.getFullYear(), today.getMonth() - 2, 1)), to: ymd(today), buyer: "", insp: "", type: "" };
      el.innerHTML = '<div class="qx"><h1>Inspector Dashboard</h1><div class="sub">Counts every saved (non-draft) report from 1st Bundle, Sewing Inline, Finishing Inline, 1st Carton, Pre-Final and Final.</div>' + warnHTML(data) +
        '<div class="qx-card"><div class="qx-filters"><div><label>From</label><input type="date" id="qxFrom"></div><div><label>To</label><input type="date" id="qxTo"></div>' +
        '<div><label>Buyer</label><select id="qxB"></select></div><div><label>Inspector</label><select id="qxI"></select></div><div><label>Inspection</label><select id="qxT"></select></div>' +
        '<div style="align-self:end"><button class="btn btn-ghost" id="qxRef">↻ Refresh</button></div></div></div><div id="qxBody"></div></div>';
      var $ = function (id) { return el.querySelector("#" + id); };
      $("qxFrom").value = f.from; $("qxTo").value = f.to;
      $("qxB").innerHTML = opts(buyers, "", "All buyers"); $("qxI").innerHTML = opts(insps, "", "All inspectors");
      $("qxT").innerHTML = opts(TYPES.map(function (t) { return t.key; }), "", "All types");

      function draw() {
        destroyCharts();
        f.from = $("qxFrom").value; f.to = $("qxTo").value; f.buyer = $("qxB").value; f.insp = $("qxI").value; f.type = $("qxT").value;
        var a = aggregate(recs, f), judged = 0, pass = 0;
        Object.keys(a.byInsp).forEach(function (k) { judged += a.byInsp[k].judged; pass += a.byInsp[k].pass; });
        var days = Object.keys(a.byDay).sort(), months = Object.keys(a.byMonth).sort();
        var inspKeys = Object.keys(a.byInsp).sort(function (x, y) { return a.byInsp[y].n - a.byInsp[x].n; });
        var buyKeys = Object.keys(a.byBuyer).sort(function (x, y) { return a.byBuyer[y].n - a.byBuyer[x].n; });
        var shownTypes = TYPES.map(function (t) { return t.key; }).filter(function (k) { return !f.type || k === f.type; });
        var kpi = function (n, l) { return '<div class="qx-card qx-kpi"><b>' + n + "</b><span>" + l + "</span></div>"; };
        $("qxBody").innerHTML =
          '<div class="qx-grid">' + kpi(a.rows.length, "Inspections") + kpi(Object.keys(a.styles).length, "Styles checked") + kpi(inspKeys.length, "Inspectors") +
          kpi(judged ? Math.round(pass / judged * 100) + "%" : "—", "Pass rate") + "</div>" +
          '<div class="qx-card"><b>Date-wise inspections</b><div class="qx-chart"><canvas id="cDay"></canvas></div></div>' +
          '<div class="qx-card"><b>Monthly — styles checked per inspection type</b><div class="qx-chart"><canvas id="cMon"></canvas></div></div>' +
          '<div class="qx-card"><b>Buyer-wise inspections</b><div class="qx-chart"><canvas id="cBuy"></canvas></div></div>' +
          '<div class="qx-card qx-wrap"><b>Inspector-wise performance</b><table><thead><tr><th>Inspector</th>' + shownTypes.map(function (k) { return "<th>" + esc(k) + "</th>"; }).join("") +
          "<th>Total</th><th>Styles</th><th>Pass rate</th></tr></thead><tbody>" +
          (inspKeys.map(function (k) {
            var o = a.byInsp[k];
            return "<tr><td><b>" + esc(k) + "</b></td>" + shownTypes.map(function (t) { return "<td>" + (o.types[t] || 0) + "</td>"; }).join("") +
              "<td>" + o.n + "</td><td>" + Object.keys(o.set).length + "</td><td>" + (o.judged ? Math.round(o.pass / o.judged * 100) + "%" : "—") + "</td></tr>";
          }).join("") || '<tr><td colspan="' + (shownTypes.length + 4) + '">No inspections in this range.</td></tr>') + "</tbody></table></div>" +
          '<div class="qx-card qx-wrap"><b>Buyer-wise × Inspector-wise (inspections)</b><table><thead><tr><th>Buyer</th>' + inspKeys.map(function (k) { return "<th>" + esc(k) + "</th>"; }).join("") + "<th>Total</th></tr></thead><tbody>" +
          (buyKeys.map(function (b) {
            return "<tr><td><b>" + esc(b) + "</b></td>" + inspKeys.map(function (k) { return "<td>" + (a.matrix[b][k] || "") + "</td>"; }).join("") + "<td>" + a.byBuyer[b].n + "</td></tr>";
          }).join("") || '<tr><td colspan="3">No data.</td></tr>') + "</tbody></table></div>";

        mk("cDay", { type: "line", data: { labels: days, datasets: [{ label: "Inspections", data: days.map(function (d) { return a.byDay[d]; }), borderColor: PALETTE[0], backgroundColor: PALETTE[0], tension: .2 }] }, options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
        mk("cMon", { type: "bar", data: { labels: months, datasets: shownTypes.map(function (t, i) { return { label: t, backgroundColor: PALETTE[i % PALETTE.length], data: months.map(function (m) { return Object.keys((a.byMonth[m] || {})[t] || {}).length; }) }; }) },
          options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
        mk("cBuy", { type: "bar", data: { labels: buyKeys, datasets: [{ label: "Inspections", backgroundColor: PALETTE[1], data: buyKeys.map(function (b) { return a.byBuyer[b].n; }) }] }, options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
      }
      ["qxFrom", "qxTo", "qxB", "qxI", "qxT"].forEach(function (id) { $(id).onchange = draw; });
      $("qxRef").onclick = function () { cache = null; renderDashboard(el); };
      draw();
    });
  }

  function renderSearch(el) {
    el.innerHTML = '<div class="qx"><h1>Search Reports</h1><div class="qx-card">Loading reports…</div></div>';
    loadAll().then(function (data) {
      var recs = data.recs.filter(function (x) { return x.outcome !== "Draft"; });
      var buyers = Object.keys(recs.reduce(function (o, x) { if (x.buyer) o[x.buyer] = 1; return o; }, {})).sort();
      el.innerHTML = '<div class="qx"><h1>Search Reports</h1><div class="sub">Every saved inspection report. Click PDF to download the full report.</div>' + warnHTML(data) +
        '<div class="qx-card"><div class="qx-filters"><div><label>Type</label><select id="sType"></select></div><div><label>Buyer</label><select id="sBuyer"></select></div>' +
        '<div><label>IR No</label><input id="sIr"></div><div><label>Style</label><input id="sStyle"></div><div><label>From</label><input type="date" id="sFrom"></div><div><label>To</label><input type="date" id="sTo"></div>' +
        '<div style="align-self:end"><button class="btn btn-ghost" id="sRef">↻ Refresh</button></div></div></div><div class="qx-card qx-wrap"><div id="sCount" style="font:12px var(--mono);color:var(--ink-soft);margin-bottom:8px"></div>' +
        '<table><thead><tr><th>Date</th><th>Type</th><th>SBU</th><th>Buyer</th><th>IR</th><th>Style</th><th>Inspector</th><th>Result</th><th>PDF</th></tr></thead><tbody id="sBody"></tbody></table></div></div>';
      var $ = function (id) { return el.querySelector("#" + id); };
      $("sType").innerHTML = opts(TYPES.map(function (t) { return t.key; }), "", "All types");
      $("sBuyer").innerHTML = opts(buyers, "", "All buyers");
      function draw() {
        var ir = $("sIr").value.trim().toLowerCase(), st = $("sStyle").value.trim().toLowerCase(), f = $("sFrom").value, t = $("sTo").value;
        var rows = recs.filter(function (x) {
          return (!$("sType").value || x.type === $("sType").value) && (!$("sBuyer").value || x.buyer === $("sBuyer").value) &&
            (!ir || x.ir.toLowerCase().indexOf(ir) >= 0) && (!st || x.style.toLowerCase().indexOf(st) >= 0) && (!f || x.date >= f) && (!t || (x.date && x.date <= t));
        }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
        $("sCount").textContent = rows.length + " report(s)" + (rows.length > 300 ? " — showing latest 300" : "");
        $("sBody").innerHTML = rows.slice(0, 300).map(function (x) {
          return "<tr><td>" + esc(x.date || "—") + "</td><td>" + esc(x.type) + "</td><td>" + esc(x.sbu) + "</td><td>" + esc(x.buyer) + "</td><td>" + esc(x.ir) + "</td><td>" + esc(x.style) +
            "</td><td>" + esc(x.inspector) + "</td><td>" + esc(x.decision || x.outcome) + "</td><td>" + pdfLink(x) + "</td></tr>";
        }).join("") || '<tr><td colspan="9">No reports match.</td></tr>';
      }
      ["sType", "sBuyer", "sFrom", "sTo"].forEach(function (id) { $(id).onchange = draw; });
      ["sIr", "sStyle"].forEach(function (id) { $(id).oninput = draw; });
      $("sRef").onclick = function () { cache = null; renderSearch(el); };
      draw();
    });
  }

  window.QAInsights = {
    render: function (tab, el) { injectCss(); destroyCharts(); return tab === "dashboard" ? renderDashboard(el) : tab === "search" ? renderSearch(el) : renderTracking(el); },
    _t: { tracking: tracking, aggregate: aggregate, outcomeOf: outcomeOf, normDate: normDate }
  };
})();
