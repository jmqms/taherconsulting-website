/*
 * psi-team.js — QA Team / PSI (Pre-Shipment Inspector) master list.
 *  - Adds name suggestions (datalist #psiList) to every "Inspected By" /
 *    "Inspector Name" field, so names are picked, not mistyped.
 *  - PSITeam.resolve(text) maps a typed name, PSI code (PSI004) or employee ID
 *    (JMF001821) to the official member, so the Inspector Dashboard groups
 *    one person under one row.
 * To change the team, edit the TEAM list below.
 */
(function () {
  var TEAM = [
    ["Sheikh Mohammad Rasel", "PSI001", "JMF007211", "Assistant Manager"],
    ["Md. Salahuddin", "PSI002", "JMF018578", "Assistant Manager"],
    ["Md Abu Yusuf Sarkar", "PSI003", "JMF001953", "Senior Executive"],
    ["Md Tariqul Islam", "PSI004", "JMF001821", "Senior Executive"],
    ["Md Shofiqul Islam", "PSI005", "JMF001642", "Executive"],
    ["Md. Razon Hossen", "PSI006", "JMF006672", "Junior Executive"],
    ["Omar Farque", "PSI007", "JMF001850", "Quality Auditor (Staff)"],
    ["Md Samiul Islam", "PSI008", "JMF001989", "Senior Quality Inspector"],
    ["Md. Rashedul Islam", "PSI009", "JMF001655", "Quality Auditor (Staff)"],
    ["Md Ariful Islam", "PSI010", "JMF002025", "Quality Auditor (Staff)"],
    ["Hafizur Rahaman", "PSI011", "JMF001950", "Quality Inspector"],
    ["Md Apple Mia", "PSI012", "JMF014889", "Quality Inspector"],
    ["Alpana Akter", "PSI013", "JMF001793", "Senior Quality Inspector"],
    ["Md Abdullah", "PSI014", "JMF001758", "Senior Quality Inspector"],
    ["Bayezid Bustami", "PSI015", "JMF015608", "Quality Inspector"],
    ["Shahinur Alam", "PSI016", "JMF008958", "Quality Auditor (Staff)"],
    ["Md Arafat Islam", "PSI017", "JMF010722", "Quality Inspector"],
    ["Md. Musa Karemoullah", "PSI018", "JMF010347", "Quality Auditor (Staff)"],
    ["Md Jahidul Islam", "PSI019", "JMF002107", "Executive"],
    ["Md Abul Kashem Azad", "PSI020", "JMF001507", "Executive"],
    ["Md Najmul Huda", "PSI021", "JMF013032", "Executive"],
    ["Imtiaz Ahmed", "PSI022", "JMF015960", "Senior Executive"],
    ["Md Rasel Howlader", "PSI023", "JMF001772", "Senior Quality Inspector"],
    ["Ashifur Rahman", "PSI024", "JMF008571", "Quality Auditor (Staff)"],
    ["Kamruzzaman", "PSI025", "JMF013068", "Junior Executive"],
    ["Mst. Subarna Khatun", "PSI026", "JMF002027", "Quality Auditor (Staff)"],
    ["Md Shafiqul Islam", "PSI027", "JMF001955", "Junior Executive"],
    ["Khademul Islam", "PSI028", "JMF005538", "Executive"],
    ["Md Monir Uddin", "PSI029", "JMF001785", "Quality Auditor (Staff)"],
    ["Abu Naim Ripon", "PSI030", "JMF013925", "Executive"],
    ["Ishtiak Ahmed", "PSI031", "JMF019238", "Executive"],
    ["MD. Rezaul Karim Mozumder", "PSI032", "JMF001861", "Executive"],
    ["Mst. Sabina Yeasmin Moon", "PSI033", "JMF020722", "Reporter (Staff)"],
    ["Md Mostafizur Rahman", "PSI034", "JMF001814", "Senior Executive"],
    ["Md Al Amin", "PSI035", "JMF013210", "Executive"],
    ["Md Tuhin Mia", "PSI036", "JMF014882", "Quality Auditor (Staff)"],
    ["Md Shohidul Islam", "PSI037", "JMF001860", "Executive"],
    ["Md. Abdur Rahman Koraishi", "PSI038", "JMF009982", "Quality Auditor (Staff)"]
  ];

  function key(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  var team = TEAM.map(function (r) { return { name: r[0], code: r[1], empId: r[2], designation: r[3] }; });
  var byKey = {}, byCode = {}, byEmp = {}, byName = {};
  team.forEach(function (m) { byKey[key(m.name)] = m; byCode[m.code] = m; byEmp[m.empId] = m; byName[m.name] = m; });

  function resolve(raw) {
    var k = key(raw);
    if (!k) return null;
    if (byKey[k]) return byKey[k];
    var c = k.match(/\bpsi\s*0*(\d{1,3})\b/);
    if (c) { var code = "PSI" + ("00" + c[1]).slice(-3); if (byCode[code]) return byCode[code]; }
    var e = k.match(/\bjmf\s*(\d{6})\b/);
    if (e && byEmp["JMF" + e[1]]) return byEmp["JMF" + e[1]];
    return null;
  }

  window.PSITeam = { team: team, resolve: resolve, byName: function (n) { return byName[n] || null; } };

  function addList() {
    if (document.getElementById("psiList")) return;
    var dl = document.createElement("datalist");
    dl.id = "psiList";
    dl.innerHTML = team.map(function (m) {
      return '<option value="' + m.name.replace(/"/g, "&quot;") + '" label="' + m.code + " · " + m.designation + '"></option>';
    }).join("");
    document.body.appendChild(dl);
  }
  if (document.body) addList(); else document.addEventListener("DOMContentLoaded", addList);
})();
