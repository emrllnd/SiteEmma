/* =========================================================
   EMMA — logique de l'application
   Les données sont enregistrées dans le navigateur (localStorage).
   ========================================================= */

/* ---------- Données & sauvegarde ---------- */
const STORAGE_KEY = "emma-data";

const defaultData = () => ({
  profile: { name: "Emma", age: 28, height: 165, activity: "1.375", goal: "0" },
  cycle: { defaultLength: 28, days: {} },
  food: {},
  water: {},
  supplements: [],
  suppLog: {},
  weights: [],
  weightGoal: null,
  pilates: [],
  pilatesGoals: { sessions: 3, minutes: 150 },
  goals: []
});

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaultData(), JSON.parse(raw));
  } catch (e) { /* stockage indisponible */ }
  return defaultData();
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch (e) { toast("Impossible d'enregistrer dans ce navigateur"); }
}

/* ---------- Utilitaires ---------- */
const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const DAY = 86400000;

function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function diffDays(a, b) {
  return Math.round((fromKey(toKey(a)) - fromKey(toKey(b))) / DAY);
}
const todayKey = () => toKey(new Date());

function fmtDate(d, opts = { day: "numeric", month: "short" }) {
  return d.toLocaleDateString("fr-FR", opts);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function round(n, dec = 0) {
  const p = Math.pow(10, dec);
  return Math.round(n * p) / p;
}
function startOfWeek(d) {
  const r = fromKey(toKey(d));
  const day = (r.getDay() + 6) % 7; // lundi = 0
  return addDays(r, -day);
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2000);
}

/* ---------- Calendriers jolis à la place de ceux du navigateur ---------- */
document.querySelectorAll('input[type="date"]').forEach((i) => EmmaDatePicker.enhance(i));

/* ---------- Navigation ---------- */
document.querySelectorAll(".nav-link").forEach((btn) => {
  btn.addEventListener("click", () => showSection(btn.dataset.section));
});

function showSection(id) {
  document.querySelectorAll(".nav-link").forEach((b) => b.classList.toggle("active", b.dataset.section === id));
  document.querySelectorAll(".section").forEach((s) => s.classList.toggle("active", s.id === id));
  try { localStorage.setItem("emma-tab", id); } catch (e) {}
  window.scrollTo({ top: 0 });
  renderAll();
}

/* =========================================================
   CYCLE
   ========================================================= */
const SYMPTOMS = ["Crampes", "Ballonnements", "Maux de tête", "Seins sensibles", "Acné", "Fatigue", "Fringales", "Mal de dos", "Nausées", "Insomnie"];

let calMonth = new Date();
calMonth.setDate(1);
let cycleSel = todayKey();

$("#cycleSymptoms").insertAdjacentHTML(
  "beforeend",
  SYMPTOMS.map((s) => `<label class="chip"><input type="checkbox" value="${s}"><span>${s}</span></label>`).join("")
);

function cycleStats() {
  const days = data.cycle.days;
  const periodKeys = Object.keys(days).filter((k) => days[k].flow).sort();
  const starts = [];
  const lengths = [];
  let runLen = 0;

  periodKeys.forEach((k, i) => {
    const prev = i > 0 ? periodKeys[i - 1] : null;
    if (!prev || diffDays(fromKey(k), fromKey(prev)) > 1) {
      if (runLen) lengths.push(runLen);
      starts.push(k);
      runLen = 1;
    } else {
      runLen++;
    }
  });
  if (runLen) lengths.push(runLen);

  const gaps = [];
  for (let i = 1; i < starts.length; i++) {
    const g = diffDays(fromKey(starts[i]), fromKey(starts[i - 1]));
    if (g >= 18 && g <= 60) gaps.push(g);
  }
  const recentGaps = gaps.slice(-6);
  const avgCycle = recentGaps.length
    ? Math.round(recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length)
    : Number(data.cycle.defaultLength) || 28;
  const avgPeriod = lengths.length
    ? Math.round(lengths.slice(-6).reduce((a, b) => a + b, 0) / Math.min(lengths.length, 6))
    : 5;

  const lastStart = starts.length ? fromKey(starts[starts.length - 1]) : null;

  // Date des prochaines règles : saisie à la main si elle existe, sinon calculée
  let next = lastStart ? addDays(lastStart, avgCycle) : null;
  let manual = false;
  const exp = data.cycle.expectedNext ? fromKey(data.cycle.expectedNext) : null;
  // La date saisie est ignorée dès que des règles ont été notées autour ou après elle
  if (exp && (!lastStart || diffDays(exp, lastStart) > 10)) {
    next = exp;
    manual = true;
  }
  const cycleStart = lastStart || (next ? addDays(next, -avgCycle) : null);
  const cycleLen = next && cycleStart ? diffDays(next, cycleStart) : avgCycle;

  return { starts, avgCycle, avgPeriod, lastStart, next, manual, cycleStart, cycleLen };
}

function cyclePredictions(stats) {
  const map = {}; // clé date -> "predicted" | "fertile" | "ovulation"
  if (!stats.next) return map;
  for (let k = 0; k < 6; k++) {
    const start = addDays(stats.next, k * stats.avgCycle);
    const ovu = addDays(start, -14);
    for (let f = -5; f <= 1; f++) map[toKey(addDays(ovu, f))] = "fertile";
    map[toKey(ovu)] = "ovulation";
    for (let p = 0; p < stats.avgPeriod; p++) map[toKey(addDays(start, p))] = "predicted";
  }
  return map;
}

function cyclePhase(day, stats) {
  const ovuDay = stats.cycleLen - 14 + 1;
  if (stats.lastStart && day <= stats.avgPeriod) return "Phase menstruelle 🩸";
  if (day < ovuDay - 1) return "Phase folliculaire 🌱";
  if (day <= ovuDay + 1) return "Phase ovulatoire ✨";
  return "Phase lutéale 🌙";
}

function currentCycleInfo() {
  const stats = cycleStats();
  if (!stats.next) return { stats, day: null };
  const today = new Date();
  const day = Math.max(1, diffDays(today, stats.cycleStart) + 1);
  const next = stats.next;
  const inDays = diffDays(next, today);
  return { stats, day, next, inDays, phase: cyclePhase(day, stats) };
}

function renderCycle() {
  const info = currentCycleInfo();
  const { stats } = info;

  $("#defaultCycle").value = data.cycle.defaultLength;
  $("#expectedNext").value = data.cycle.expectedNext || "";
  $("#avgCycle").textContent = `${stats.avgCycle} j`;
  $("#avgPeriod").textContent = `Règles : ${stats.avgPeriod} j en moyenne`;

  if (info.day) {
    $("#cycleDay").textContent = `J${info.day}`;
    $("#cyclePhase").textContent = info.phase;
    $("#nextPeriod").textContent = fmtDate(info.next);
    $("#nextPeriodIn").textContent =
      info.inDays > 0 ? `dans ${info.inDays} jour${info.inDays > 1 ? "s" : ""}`
      : info.inDays === 0 ? "prévues aujourd'hui"
      : `en retard de ${-info.inDays} jour${-info.inDays > 1 ? "s" : ""}`;
    if (stats.manual) $("#nextPeriodIn").textContent += " · date saisie";
  } else {
    $("#cycleDay").textContent = "—";
    $("#cyclePhase").textContent = "Note le 1er jour de tes règles 🌸";
    $("#nextPeriod").textContent = "—";
    $("#nextPeriodIn").textContent = "—";
  }

  // Calendrier
  const preds = cyclePredictions(stats);
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  $("#calTitle").textContent = calMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7;
  const nbDays = new Date(y, m + 1, 0).getDate();
  const tKey = todayKey();

  let html = ["L", "M", "M", "J", "V", "S", "D"].map((d) => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < offset; i++) html += `<div class="cal-day blank"></div>`;
  for (let d = 1; d <= nbDays; d++) {
    const key = toKey(new Date(y, m, d));
    const entry = data.cycle.days[key];
    const cls = ["cal-day"];
    if (entry && entry.flow) cls.push("period");
    else if (preds[key]) cls.push(preds[key]);
    if (key === tKey) cls.push("today");
    if (key === cycleSel) cls.push("selected");
    const hasNote = entry && ((entry.symptoms && entry.symptoms.length) || entry.mood || entry.notes);
    html += `<button class="${cls.join(" ")}" data-key="${key}">${d}${hasNote ? '<i class="mark"></i>' : ""}</button>`;
  }
  $("#calendar").innerHTML = html;

  // Formulaire du jour sélectionné
  const sel = data.cycle.days[cycleSel] || {};
  $("#cycleSelDate").textContent = fmtDate(fromKey(cycleSel), { weekday: "long", day: "numeric", month: "long" });
  $("#cycleFlow").value = sel.flow || "";
  $("#cycleMood").value = sel.mood || "";
  $("#cycleNotes").value = sel.notes || "";
  document.querySelectorAll("#cycleSymptoms input").forEach((c) => {
    c.checked = (sel.symptoms || []).includes(c.value);
  });
}

$("#calendar").addEventListener("click", (e) => {
  const btn = e.target.closest(".cal-day[data-key]");
  if (!btn) return;
  cycleSel = btn.dataset.key;
  renderCycle();
});
$("#calPrev").addEventListener("click", () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCycle(); });
$("#calNext").addEventListener("click", () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCycle(); });

$("#cycleForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const entry = {
    flow: $("#cycleFlow").value,
    mood: $("#cycleMood").value,
    notes: $("#cycleNotes").value.trim(),
    symptoms: [...document.querySelectorAll("#cycleSymptoms input:checked")].map((c) => c.value)
  };
  if (!entry.flow && !entry.mood && !entry.notes && !entry.symptoms.length) delete data.cycle.days[cycleSel];
  else data.cycle.days[cycleSel] = entry;
  save();
  renderCycle();
  toast("Journal enregistré 🌸");
});

$("#expectedNext").addEventListener("change", (e) => {
  data.cycle.expectedNext = e.target.value || null;
  save();
  renderAll();
  if (e.target.value) toast("Prochaines règles notées 🌸📅");
});

$("#defaultCycle").addEventListener("change", (e) => {
  const v = Number(e.target.value);
  if (v >= 20 && v <= 45) { data.cycle.defaultLength = v; save(); renderCycle(); }
});

/* =========================================================
   BESOINS NUTRITIONNELS
   ========================================================= */
function latestWeight() {
  if (!data.weights.length) return null;
  return [...data.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1).value;
}

function computeNeeds() {
  const p = data.profile;
  const w = latestWeight() || 60;
  const bmr = 10 * w + 6.25 * Number(p.height) - 5 * Number(p.age) - 161;
  const tdee = bmr * Number(p.activity);
  const kcal = Math.max(1200, Math.round((tdee + Number(p.goal)) / 10) * 10);
  const protPerKg = p.goal === "-400" ? 1.6 : p.goal === "300" ? 1.8 : 1.3;
  const prot = Math.round(w * protPerKg);
  const fat = Math.round((kcal * 0.3) / 9);
  const carb = Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4));
  const water = Math.round((w * 33) / 50) * 50 + 250; // + séance de sport
  return { w, bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, prot, fat, carb, water };
}

function renderNeeds() {
  const p = data.profile;
  $("#pName").value = p.name || "";
  $("#pAge").value = p.age;
  $("#pHeight").value = p.height;
  $("#pActivity").value = p.activity;
  $("#pGoal").value = p.goal;

  const n = computeNeeds();
  const items = [
    { label: "Énergie quotidienne", value: `${n.kcal} kcal`, sub: `Métabolisme de base ${n.bmr} kcal · Dépense ${n.tdee} kcal · Poids ${n.w} kg`, main: true },
    { label: "Protéines", value: `${n.prot} g`, sub: "Muscles, récupération" },
    { label: "Glucides", value: `${n.carb} g`, sub: "Énergie" },
    { label: "Lipides", value: `${n.fat} g`, sub: "≈ 30 % de l'énergie" },
    { label: "Eau", value: `${(n.water / 1000).toFixed(1)} L`, sub: "Boissons, par jour" },
    { label: "Fibres", value: "30 g", sub: "Légumes, céréales complètes" },
    { label: "Fer", value: "16 mg", sub: "Pertes liées aux règles" },
    { label: "Calcium", value: "950 mg", sub: "Os, contraction musculaire" },
    { label: "Magnésium", value: "300 mg", sub: "Fatigue, crampes" },
    { label: "Vitamine D", value: "15 µg", sub: "Surtout en hiver" },
    { label: "Vitamine B9", value: "330 µg", sub: "Folates" },
    { label: "Oméga-3", value: "250 mg", sub: "EPA + DHA" }
  ];
  $("#needs").innerHTML = items.map((i) => `
    <div class="need${i.main ? " main" : ""}">
      <p class="n-label">${i.label}</p>
      <p class="n-value">${i.value}</p>
      <p class="n-sub">${i.sub}</p>
    </div>`).join("");
}

$("#profileForm").addEventListener("submit", (e) => {
  e.preventDefault();
  data.profile = {
    name: $("#pName").value.trim() || "Emma",
    age: Number($("#pAge").value),
    height: Number($("#pHeight").value),
    activity: $("#pActivity").value,
    goal: $("#pGoal").value
  };
  save();
  renderAll();
  toast("Profil mis à jour ✨");
});

/* =========================================================
   ALIMENTATION
   ========================================================= */
const MEALS = ["Petit-déjeuner", "Déjeuner", "Collation", "Dîner"];
$("#foodDate").value = todayKey();

function foodTotals(key) {
  const list = data.food[key] || [];
  return list.reduce((t, f) => ({
    kcal: t.kcal + (f.kcal || 0),
    prot: t.prot + (f.prot || 0),
    carb: t.carb + (f.carb || 0),
    fat: t.fat + (f.fat || 0)
  }), { kcal: 0, prot: 0, carb: 0, fat: 0 });
}

function renderFood() {
  const key = $("#foodDate").value || todayKey();
  const list = data.food[key] || [];
  const needs = computeNeeds();
  const tot = foodTotals(key);

  // Liste par repas
  let html = "";
  MEALS.forEach((meal) => {
    const items = list.filter((f) => f.meal === meal);
    if (!items.length) return;
    const k = items.reduce((a, f) => a + f.kcal, 0);
    html += `<div class="meal-group"><h3>${meal}<small>${k} kcal</small></h3>`;
    html += items.map((f) => `
      <div class="food-item">
        <span class="name">${esc(f.name)}</span>
        <span class="macros">P ${round(f.prot, 1)} · G ${round(f.carb, 1)} · L ${round(f.fat, 1)}</span>
        <span class="kcal">${f.kcal}</span>
        <button class="del" data-del-food="${f.id}" aria-label="Supprimer">×</button>
      </div>`).join("");
    html += "</div>";
  });
  $("#mealList").innerHTML = html || `<p class="empty">Aucun aliment noté pour ce jour 🍽️</p>`;

  // Anneau calories
  const pct = Math.min(1, tot.kcal / needs.kcal);
  const c = 2 * Math.PI * 52;
  const ring = $("#kcalRing");
  ring.style.strokeDasharray = c;
  ring.style.strokeDashoffset = c * (1 - pct);
  $("#kcalEaten").textContent = Math.round(tot.kcal);
  $("#kcalGoal").textContent = `/ ${needs.kcal} kcal`;

  // Macros
  const macros = [
    { n: "Protéines", v: tot.prot, g: needs.prot },
    { n: "Glucides", v: tot.carb, g: needs.carb },
    { n: "Lipides", v: tot.fat, g: needs.fat }
  ];
  $("#macroBars").innerHTML = macros.map((m) => `
    <div class="macro">
      <div class="macro-top"><span>${m.n}</span><span>${round(m.v)} / ${m.g} g</span></div>
      <div class="bar${m.v > m.g * 1.1 ? " over" : ""}"><span style="width:${Math.min(100, (m.v / m.g) * 100)}%"></span></div>
    </div>`).join("");

  // Eau (verres de 250 ml)
  const goalGlasses = Math.round(needs.water / 250);
  const drunk = data.water[key] || 0;
  const total = Math.max(goalGlasses, drunk + 1);
  let w = "";
  for (let i = 0; i < total; i++) {
    w += `<button class="glass${i < drunk ? " full" : ""}" data-glass="${i}" aria-label="Verre ${i + 1}"></button>`;
  }
  $("#water").innerHTML = w;
  $("#waterSub").textContent = `${drunk} verre${drunk > 1 ? "s" : ""} (${(drunk * 0.25).toFixed(2).replace(".", ",")} L) sur ${goalGlasses} conseillés`;
}

$("#foodDate").addEventListener("change", renderFood);

$("#foodForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const key = $("#foodDate").value || todayKey();
  (data.food[key] = data.food[key] || []).push({
    id: uid(),
    meal: $("#foodMeal").value,
    name: $("#foodName").value.trim(),
    kcal: Number($("#foodKcal").value) || 0,
    prot: Number($("#foodProt").value) || 0,
    carb: Number($("#foodCarb").value) || 0,
    fat: Number($("#foodFat").value) || 0
  });
  save();
  ["#foodName", "#foodKcal", "#foodProt", "#foodCarb", "#foodFat"].forEach((s) => ($(s).value = ""));
  $("#foodName").focus();
  renderFood();
  toast("Aliment ajouté 🍓");
});

$("#mealList").addEventListener("click", (e) => {
  const id = e.target.dataset.delFood;
  if (!id) return;
  const key = $("#foodDate").value;
  data.food[key] = (data.food[key] || []).filter((f) => f.id !== id);
  save();
  renderFood();
});

$("#water").addEventListener("click", (e) => {
  const g = e.target.dataset.glass;
  if (g === undefined) return;
  const key = $("#foodDate").value || todayKey();
  const i = Number(g);
  data.water[key] = (data.water[key] || 0) === i + 1 ? i : i + 1;
  save();
  renderFood();
});

/* =========================================================
   COMPLÉMENTS
   ========================================================= */
function isTaken(suppId, key) {
  return (data.suppLog[key] || []).includes(suppId);
}
function toggleTaken(suppId, key) {
  const list = data.suppLog[key] || [];
  data.suppLog[key] = list.includes(suppId) ? list.filter((i) => i !== suppId) : [...list, suppId];
  save();
}
function streak(suppId) {
  let d = new Date();
  if (!isTaken(suppId, toKey(d))) d = addDays(d, -1);
  let n = 0;
  while (isTaken(suppId, toKey(d))) { n++; d = addDays(d, -1); }
  return n;
}

function renderSupplements() {
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(new Date(), -i));
  const tKey = todayKey();

  if (!data.supplements.length) {
    $("#suppTable").innerHTML = `<tr><td class="empty">Ajoute ton premier complément 💊</td></tr>`;
    return;
  }
  let html = `<thead><tr><th></th>${days.map((d) =>
    `<th class="${toKey(d) === tKey ? "today" : ""}">${fmtDate(d, { weekday: "short" }).replace(".", "")}<br>${d.getDate()}</th>`
  ).join("")}<th>Série</th><th></th></tr></thead><tbody>`;
  data.supplements.forEach((s) => {
    html += `<tr><td class="name"><strong>${esc(s.name)}</strong><small>${esc(s.dose)} · ${esc(s.time)}</small></td>`;
    days.forEach((d) => {
      const k = toKey(d);
      html += `<td><input type="checkbox" data-supp="${s.id}" data-day="${k}" ${isTaken(s.id, k) ? "checked" : ""}></td>`;
    });
    html += `<td><span class="streak">${streak(s.id)} j</span></td><td><button class="del" data-del-supp="${s.id}" aria-label="Supprimer">×</button></td></tr>`;
  });
  $("#suppTable").innerHTML = html + "</tbody>";
}

$("#suppForm").addEventListener("submit", (e) => {
  e.preventDefault();
  data.supplements.push({ id: uid(), name: $("#suppName").value.trim(), dose: $("#suppDose").value.trim(), time: $("#suppTime").value });
  save();
  e.target.reset();
  renderSupplements();
  toast("Complément ajouté 💊✨");
});

$("#suppTable").addEventListener("change", (e) => {
  const { supp, day } = e.target.dataset;
  if (!supp) return;
  toggleTaken(supp, day);
  renderSupplements();
});
$("#suppTable").addEventListener("click", (e) => {
  const id = e.target.dataset.delSupp;
  if (!id) return;
  const s = data.supplements.find((x) => x.id === id);
  if (!confirm(`Supprimer « ${s.name} » ?`)) return;
  data.supplements = data.supplements.filter((x) => x.id !== id);
  save();
  renderSupplements();
});

/* =========================================================
   POIDS
   ========================================================= */
$("#wDate").value = todayKey();

function renderWeight() {
  const list = [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
  const cur = list.length ? list.at(-1).value : null;
  const first = list.length ? list[0].value : null;

  $("#wCurrent").textContent = cur ? `${String(cur).replace(".", ",")} kg` : "—";
  $("#wGoal").textContent = data.weightGoal ? `${String(data.weightGoal).replace(".", ",")} kg` : "—";
  $("#wGoalInput").value = data.weightGoal || "";

  if (list.length > 1) {
    const d = round(cur - first, 1);
    $("#wDiff").textContent = `${d > 0 ? "+" : ""}${String(d).replace(".", ",")} kg`;
  } else {
    $("#wDiff").textContent = "—";
  }

  if (cur && data.profile.height) {
    const h = data.profile.height / 100;
    const bmi = round(cur / (h * h), 1);
    $("#wBmi").textContent = String(bmi).replace(".", ",");
    $("#wBmiSub").textContent = bmi < 18.5 ? "Insuffisance pondérale" : bmi < 25 ? "Corpulence normale" : bmi < 30 ? "Surpoids" : "Obésité";
  } else {
    $("#wBmi").textContent = "—";
    $("#wBmiSub").textContent = "";
  }

  $("#weightHistory").innerHTML = [...list].reverse().map((w, i, arr) => {
    const prev = arr[i + 1];
    const d = prev ? round(w.value - prev.value, 1) : null;
    return `<li><span class="h-main">${fmtDate(fromKey(w.date), { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
      ${d !== null ? `<small>${d > 0 ? "+" : ""}${String(d).replace(".", ",")} kg</small>` : ""}</span>
      <strong>${String(w.value).replace(".", ",")} kg</strong>
      <button class="del" data-del-weight="${w.date}" aria-label="Supprimer">×</button></li>`;
  }).join("");

  drawWeightChart(list);
}

function drawWeightChart(list) {
  const el = $("#weightChart");
  if (list.length < 2) {
    el.innerHTML = `<p class="empty">Ajoute au moins deux pesées pour voir ta courbe 🦋</p>`;
    return;
  }
  const W = 640, H = 260, pl = 40, pr = 16, pt = 16, pb = 30;
  const vals = list.map((w) => w.value);
  if (data.weightGoal) vals.push(data.weightGoal);
  let min = Math.floor(Math.min(...vals) - 1);
  let max = Math.ceil(Math.max(...vals) + 1);
  const t0 = fromKey(list[0].date).getTime();
  const t1 = fromKey(list.at(-1).date).getTime();
  const x = (k) => pl + ((fromKey(k).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pl - pr);
  const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de poids">
    <defs><linearGradient id="wGrad" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#ec6a91" stop-opacity=".25"/><stop offset="100%" stop-color="#ec6a91" stop-opacity="0"/>
    </linearGradient></defs>`;

  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = min + ((max - min) * i) / steps;
    svg += `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis-label" x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${round(v, 1)}</text>`;
  }
  const labelIdx = list.length <= 6 ? list.map((_, i) => i) : [0, Math.floor(list.length / 2), list.length - 1];
  labelIdx.forEach((i) => {
    svg += `<text class="axis-label" x="${x(list[i].date)}" y="${H - 8}" text-anchor="middle">${fmtDate(fromKey(list[i].date))}</text>`;
  });

  if (data.weightGoal) {
    svg += `<line class="goal-line" x1="${pl}" x2="${W - pr}" y1="${y(data.weightGoal)}" y2="${y(data.weightGoal)}"/>
      <text class="goal-label" x="${W - pr}" y="${y(data.weightGoal) - 6}" text-anchor="end">Objectif ${data.weightGoal} kg</text>`;
  }

  const pts = list.map((w) => `${x(w.date)},${y(w.value)}`);
  svg += `<polygon class="area" points="${x(list[0].date)},${H - pb} ${pts.join(" ")} ${x(list.at(-1).date)},${H - pb}"/>`;
  svg += `<polyline class="line" points="${pts.join(" ")}"/>`;
  list.forEach((w) => {
    svg += `<circle class="pt" cx="${x(w.date)}" cy="${y(w.value)}" r="4"><title>${fmtDate(fromKey(w.date))} : ${w.value} kg</title></circle>`;
  });
  el.innerHTML = svg + "</svg>";
}

$("#weightForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const date = $("#wDate").value;
  const value = Number($("#wValue").value);
  data.weights = data.weights.filter((w) => w.date !== date);
  data.weights.push({ date, value });
  save();
  $("#wValue").value = "";
  renderWeight();
  toast("Pesée enregistrée 🦋");
});
$("#weightGoalForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = Number($("#wGoalInput").value);
  data.weightGoal = v || null;
  save();
  renderWeight();
  toast("Objectif enregistré 🎯");
});
$("#weightHistory").addEventListener("click", (e) => {
  const d = e.target.dataset.delWeight;
  if (!d) return;
  data.weights = data.weights.filter((w) => w.date !== d);
  save();
  renderWeight();
});

/* =========================================================
   PILATES & OBJECTIFS
   ========================================================= */
$("#plDate").value = todayKey();

function pilatesWeek() {
  const start = toKey(startOfWeek(new Date()));
  const end = toKey(addDays(startOfWeek(new Date()), 6));
  const list = data.pilates.filter((s) => s.date >= start && s.date <= end);
  return { sessions: list.length, minutes: list.reduce((a, s) => a + s.duration, 0) };
}

function renderPilates() {
  const wk = pilatesWeek();
  const g = data.pilatesGoals;
  $("#plGoalSessions").value = g.sessions;
  $("#plGoalMinutes").value = g.minutes;

  $("#plWeekSessions").textContent = `${wk.sessions} / ${g.sessions}`;
  $("#plSessionsBar").style.width = `${Math.min(100, (wk.sessions / g.sessions) * 100)}%`;
  $("#plSessionsSub").textContent = wk.sessions >= g.sessions ? "Objectif atteint, bravo ! 🎀" : `Encore ${g.sessions - wk.sessions} séance${g.sessions - wk.sessions > 1 ? "s" : ""}`;

  $("#plWeekMinutes").textContent = `${wk.minutes} / ${g.minutes}`;
  $("#plMinutesBar").style.width = `${Math.min(100, (wk.minutes / g.minutes) * 100)}%`;
  $("#plMinutesSub").textContent = wk.minutes >= g.minutes ? "Objectif atteint ! 💪✨" : `Encore ${g.minutes - wk.minutes} min`;

  const totalMin = data.pilates.reduce((a, s) => a + s.duration, 0);
  $("#plTotal").textContent = data.pilates.length;
  $("#plTotalSub").textContent = `séances · ${Math.floor(totalMin / 60)} h ${totalMin % 60} min au total`;

  const sorted = [...data.pilates].sort((a, b) => b.date.localeCompare(a.date));
  $("#pilatesHistory").innerHTML = sorted.map((s) => `
    <li><span class="h-main">${esc(s.type)}
      <small>${fmtDate(fromKey(s.date), { weekday: "short", day: "numeric", month: "short" })} · <span class="intensity">${"●".repeat(s.intensity)}${"○".repeat(5 - s.intensity)}</span>${s.notes ? " · " + esc(s.notes) : ""}</small></span>
      <strong>${s.duration} min</strong>
      <button class="del" data-del-pl="${s.id}" aria-label="Supprimer">×</button></li>`).join("")
    || `<li class="empty">Aucune séance pour l'instant, on s'y met ? 🧘‍♀️</li>`;

  renderGoalList($("#goalList"));
}

function renderGoalList(el) {
  el.innerHTML = data.goals.map((g) => `
    <li class="${g.done ? "done" : ""}">
      <label><input type="checkbox" data-goal="${g.id}" ${g.done ? "checked" : ""}><span>${esc(g.text)}</span></label>
      <button class="del" data-del-goal="${g.id}" aria-label="Supprimer">×</button>
    </li>`).join("") || `<li class="empty">Aucun objectif pour l'instant 💫 Ajoute-en un dans l'onglet Pilates.</li>`;
}

$("#pilatesForm").addEventListener("submit", (e) => {
  e.preventDefault();
  data.pilates.push({
    id: uid(),
    date: $("#plDate").value,
    duration: Number($("#plDuration").value),
    type: $("#plType").value,
    intensity: Number($("#plIntensity").value),
    notes: $("#plNotes").value.trim()
  });
  save();
  $("#plNotes").value = "";
  renderPilates();
  toast("Séance ajoutée, bravo ma belle 🧘‍♀️💖");
});
$("#pilatesHistory").addEventListener("click", (e) => {
  const id = e.target.dataset.delPl;
  if (!id) return;
  data.pilates = data.pilates.filter((s) => s.id !== id);
  save();
  renderPilates();
});
$("#plGoalsForm").addEventListener("submit", (e) => {
  e.preventDefault();
  data.pilatesGoals = {
    sessions: Number($("#plGoalSessions").value) || 3,
    minutes: Number($("#plGoalMinutes").value) || 150
  };
  save();
  renderPilates();
  toast("Objectifs enregistrés 🎀");
});
$("#goalForm").addEventListener("submit", (e) => {
  e.preventDefault();
  data.goals.push({ id: uid(), text: $("#goalText").value.trim(), done: false });
  save();
  $("#goalText").value = "";
  renderPilates();
});

// Cases à cocher des objectifs (onglet Pilates et accueil)
function goalHandlers(el) {
  el.addEventListener("change", (e) => {
    const id = e.target.dataset.goal;
    if (!id) return;
    const g = data.goals.find((x) => x.id === id);
    g.done = e.target.checked;
    save();
    renderAll();
    if (g.done) toast("Objectif accompli ! 🎉💖");
  });
  el.addEventListener("click", (e) => {
    const id = e.target.dataset.delGoal;
    if (!id) return;
    data.goals = data.goals.filter((x) => x.id !== id);
    save();
    renderAll();
  });
}
goalHandlers($("#goalList"));
goalHandlers($("#dashGoals"));

/* =========================================================
   ACCUEIL
   ========================================================= */
function renderDashboard() {
  const now = new Date();
  $("#todayLabel").textContent = fmtDate(now, { weekday: "long", day: "numeric", month: "long" });
  $("#helloName").textContent = data.profile.name || "Emma";

  const info = currentCycleInfo();
  if (info.day) {
    $("#dashCycleDay").textContent = `J${info.day}`;
    $("#dashCycleSub").textContent = info.inDays > 0 ? `${info.phase} · règles dans ${info.inDays} j` : info.phase;
  } else {
    $("#dashCycleDay").textContent = "—";
    $("#dashCycleSub").textContent = "Ajoute tes règles 🌸";
  }

  const needs = computeNeeds();
  $("#dashKcal").textContent = Math.round(foodTotals(todayKey()).kcal);
  $("#dashKcalSub").textContent = `sur ${needs.kcal} kcal`;

  const w = latestWeight();
  $("#dashWeight").textContent = w ? `${String(w).replace(".", ",")} kg` : "—";
  $("#dashWeightSub").textContent = data.weightGoal
    ? `Objectif ${data.weightGoal} kg${w ? ` · ${String(round(Math.abs(w - data.weightGoal), 1)).replace(".", ",")} kg restants` : ""}`
    : "Pas d'objectif";

  const wk = pilatesWeek();
  $("#dashPilates").textContent = `${wk.sessions} / ${data.pilatesGoals.sessions}`;
  $("#dashPilatesSub").textContent = `séances · ${wk.minutes} min`;

  const tKey = todayKey();
  $("#dashSupplements").innerHTML = data.supplements.map((s) => `
    <li class="${isTaken(s.id, tKey) ? "done" : ""}">
      <label><input type="checkbox" data-dsupp="${s.id}" ${isTaken(s.id, tKey) ? "checked" : ""}>
      <span>${esc(s.name)}</span></label><small>${esc(s.dose)} · ${esc(s.time)}</small>
    </li>`).join("") || `<li class="empty">Aucun complément enregistré 💊</li>`;

  renderGoalList($("#dashGoals"));
}

$("#dashSupplements").addEventListener("change", (e) => {
  const id = e.target.dataset.dsupp;
  if (!id) return;
  toggleTaken(id, todayKey());
  renderDashboard();
});

/* =========================================================
   EXPORT / IMPORT
   ========================================================= */
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `emma-sauvegarde-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#importInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      data = Object.assign(defaultData(), JSON.parse(reader.result));
      save();
      renderAll();
      toast("Données importées ✨");
    } catch (err) {
      toast("Fichier invalide");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

/* ---------- Rendu global ---------- */
function renderAll() {
  renderDashboard();
  renderCycle();
  renderFood();
  renderNeeds();
  renderSupplements();
  if (typeof renderSkincare === "function") renderSkincare();
  renderWeight();
  renderPilates();
  if (typeof renderBooks === "function") renderBooks();
}

let startTab = "dashboard";
try { startTab = localStorage.getItem("emma-tab") || "dashboard"; } catch (e) {}
showSection(document.getElementById(startTab) ? startTab : "dashboard");
