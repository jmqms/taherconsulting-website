/*
 * report-sync.js — stops two inspectors from overwriting each other's reports.
 * The inspection pages send their whole report list on every save. This wrapper
 * remembers which report ids this browser loaded, works out which ones the user
 * deleted, and sends them as deletedIds so the backend can MERGE instead of
 * overwriting. It wraps qaApi() in each inspection page.
 */
(function () {
  var PAIRS = {
    save1stBundle: "list1stBundle", saveSewingInline: "listSewingInline",
    saveFinishingInline: "listFinishingInline", save1stCarton: "list1stCarton",
    savePreFinal: "listPreFinal", saveFinal: "listFinal"
  };
  var LISTS = {};
  Object.keys(PAIRS).forEach(function (k) { LISTS[PAIRS[k]] = 1; });
  var known = {};

  function ids(arr) { return (arr || []).map(function (r) { return r && r.id; }).filter(Boolean); }

  window.ReportSync = {
    wrap: function (payload, raw) {
      var a = payload && payload.action;
      if (a && LISTS[a]) {
        return raw(payload).then(function (res) { if (res && res.ok) known[a] = ids(res.reports); return res; });
      }
      if (a && PAIRS[a]) {
        var sent = ids(payload.reports), listKey = PAIRS[a];
        var gone = (known[listKey] || []).filter(function (id) { return sent.indexOf(id) < 0; });
        var p2 = Object.assign({}, payload, { deletedIds: gone });
        return raw(p2).then(function (res) { if (res && res.ok) known[listKey] = sent; return res; });
      }
      return raw(payload);
    }
  };
})();
