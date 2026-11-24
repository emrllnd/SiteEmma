/* =========================================================
   EMMA — suivi skincare
   Routine du matin et du soir, produits avec leurs jours,
   suivi de la semaine, série et état de la peau.
   ========================================================= */

// Types de produits, dans l'ordre où on les applique
const SKIN_TYPES = [
  { id: "demaquillant", label: "Démaquillant", ico: "🫧" },
  { id: "nettoyant",    label: "Nettoyant",    ico: "🧼" },
  { id: "exfoliant",    label: "Exfoliant",    ico: "✨" },
  { id: "tonique",      label: "Tonique / lotion", ico: "💧" },
  { id: "essence",      label: "Essence",      ico: "💦" },
  { id: "serum",        label: "Sérum",        ico: "💎" },
  { id: "traitement",   label: "Traitement (rétinol, acide…)", ico: "🧪" },
  { id: "yeux",         label: "Contour des yeux", ico: "👀" },
  { id: "creme",        label: "Crème hydratante", ico: "🧴" },
  { id: "huile",        label: "Huile",        ico: "🌿" },
  { id: "spf",          label: "Protection solaire", ico: "☀️" },
  { id: "masque",       label: "Masque",       ico: "🎭" },
  { id: "levres",       label: "Lèvres",       ico: "💋" },
  { id: "autre",        label: "Autre",        ico: "🌸" }
];
const SKIN_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SKIN_MOODS = [
  { v: 1, e: "😣", t: "Peau difficile" },
  { v: 2, e: "😕", t: "Pas top" },
  { v: 3, e: "😐", t: "Correcte" },
  { v: 4, e: "🙂", t: "Jolie peau" },
  { v: 5, e: "🤩", t: "Peau parfaite" }
];

let skinEditId = null;

/* ---------- Données ---------- */
function skin() {
  if (!data.skincare) data.skincare = {};
  const s = data.skincare;
  s.products = s.products || [];
  s.log = s.log || {};
  s.skin = s.skin || {};
  s.seeded = s.seeded || [];
  return s;
}

// Ajoute une fois les produits listés dans js/skincare-produits.js
function seedSkincare() {
  if (typeof SKINCARE_PRODUITS === "undefined") return;
  const s = skin();
  let added = 0;
  SKINCARE_PRODUITS.forEach((p) => {
    if (!p.id || s.seeded.includes(p.id)) return;
    s.seeded.push(p.id);
    if (!s.products.some((x) => x.id === p.id)) {
      s.products.push({
        id: p.id, name: p.name || "Produit", brand: p.brand || "", ref: p.ref || "",
        type: p.type || "autre", am: !!p.am, pm: !!p.pm,
        days: Array.isArray(p.days) ? p.days : [0, 1, 2, 3, 4, 5, 6], notes: p.notes || ""
      });
      added++;
    }
  });
  if (added) save();
}

const typeInfo = (id) => SKIN_TYPES.find((t) => t.id === id) || SKIN_TYPES[SKIN_TYPES.length - 1];
const typeIndex = (id) => { const i = SKIN_TYPES.findIndex((t) => t.id === id); return i < 0 ? 99 : i; };
const weekday = (key) => (fromKey(key).getDay() + 6) % 7;

function routineFor(key, moment) {
  const d = weekday(key);
  return skin().products
    .filter((p) => p[moment] && p.days.includes(d))
    .sort((a, b) => typeIndex(a.type) - typeIndex(b.type) || a.name.localeCompare(b.name));
}
function doneList(key, moment) {
  return ((skin().log[key] || {})[moment]) || [];
}
// "full" | "part" | "none" | "off" (rien de prévu)
function routineState(key, moment) {
  const list = routineFor(key, moment);
  if (!list.length) return "off";
  const done = doneList(key, moment);
  const n = list.filter((p) => done.includes(p.id)).length;
  return n === list.length ? "full" : n ? "part" : "none";
}
function dayComplete(key) {
  const st = ["am", "pm"].map((m) => routineState(key, m)).filter((x) => x !== "off");
  return st.length > 0 && st.every((x) => x === "full");
}
function skinStreak() {
  let d = new Date();
  if (!dayComplete(toKey(d))) d = addDays(d, -1);
  let n = 0;
  while (dayComplete(toKey(d)) && n < 3650) { n++; d = addDays(d, -1); }
  return n;
}
function scheduleText(p) {
  const when = [p.am ? "☀️ Matin" : "", p.pm ? "🌙 Soir" : ""].filter(Boolean).join(" · ") || "Aucun moment";
  const days = p.days.length === 7 ? "tous les jours"
    : p.days.length ? p.days.slice().sort().map((i) => SKIN_DAYS[i]).join(", ") : "aucun jour";
  return `${when} · ${days}`;
}

/* ---------- Rendu ---------- */
function renderSkincare() {
  const key = $("#skinDate").value || todayKey();
  const s = skin();

  // Routines matin / soir
  let todo = 0, full = 0;
  ["am", "pm"].forEach((m) => {
    const list = routineFor(key, m);
    const done = doneList(key, m);
    const n = list.filter((p) => done.includes(p.id)).length;
    const box = m === "am" ? "#skinAm" : "#skinPm";
    $(box + "").innerHTML = list.map((p) => {
      const t = typeInfo(p.type);
      const sub = [p.brand, p.ref, p.notes].filter(Boolean).map(esc).join(" · ");
      const isDone = done.includes(p.id);
      return `<li class="${isDone ? "done" : ""}"><label>
        <input type="checkbox" data-skin="${p.id}" data-moment="${m}" ${isDone ? "checked" : ""}>
        <span class="sk-ico" title="${esc(t.label)}">${t.ico}</span>
        <span class="sk-text"><strong>${esc(p.name)}</strong>${sub ? `<small>${sub}</small>` : ""}</span>
      </label></li>`;
    }).join("") || `<li class="empty">${s.products.length ? (m === "am" ? "Rien de prévu ce matin ☁️" : "Rien de prévu ce soir ☁️") : "Ajoute tes produits juste en dessous 👇"}</li>`;
    $(m === "am" ? "#skinAmCount" : "#skinPmCount").textContent = list.length ? `${n} / ${list.length}` : "";
    $(m === "am" ? "#skinAmBar" : "#skinPmBar").style.width = list.length ? `${(n / list.length) * 100}%` : "0%";
    if (list.length) { todo++; if (n === list.length) full++; }
  });

  $("#skinDayValue").textContent = `${full} / ${todo}`;
  $("#skinDaySub").textContent = !todo ? "Aucune routine prévue"
    : full === todo ? "Routines terminées, peau de bébé 🎀" : "routines terminées";
  const st = skinStreak();
  $("#skinStreak").textContent = `${st} j`;

  // État de la peau
  const mood = s.skin[key] || {};
  const m = SKIN_MOODS.find((x) => x.v === mood.score);
  $("#skinMoodValue").textContent = m ? m.e : "—";
  $("#skinMoodSub").textContent = m ? m.t : "Pas encore notée";
  $("#skinMoods").innerHTML = SKIN_MOODS.map((x) =>
    `<button type="button" class="skin-mood" data-mood="${x.v}" aria-pressed="${mood.score === x.v}" title="${x.t}" aria-label="${x.t}">${x.e}</button>`
  ).join("");
  $("#skinNote").value = mood.note || "";

  // Semaine (7 jours jusqu'à la date choisie)
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(toKey(addDays(fromKey(key), -i)));
  const sym = { full: "✅", part: "◐", none: "·", off: "—" };
  const row = (m, label) => `<tr><td class="row-label">${label}</td>${days.map((d) => {
    const r = routineState(d, m);
    return `<td class="${r}">${sym[r]}</td>`;
  }).join("")}</tr>`;
  const moodRow = `<tr><td class="row-label">💗 Peau</td>${days.map((d) => {
    const x = SKIN_MOODS.find((mm) => mm.v === (s.skin[d] || {}).score);
    return `<td>${x ? x.e : ""}</td>`;
  }).join("")}</tr>`;
  $("#skinWeek").innerHTML = `<thead><tr><th></th>${days.map((d) =>
    `<th class="${d === key ? "today" : ""}">${SKIN_DAYS[weekday(d)]}<br>${fromKey(d).getDate()}</th>`).join("")}</tr></thead>
    <tbody>${row("am", "☀️ Matin")}${row("pm", "🌙 Soir")}${moodRow}</tbody>`;

  // Liste des produits, groupée par type
  const sorted = s.products.slice().sort((a, b) => typeIndex(a.type) - typeIndex(b.type) || a.name.localeCompare(b.name));
  let html = "", lastType = null;
  sorted.forEach((p) => {
    const t = typeInfo(p.type);
    if (t.id !== lastType) { html += `<li class="sk-group">${t.ico} ${esc(t.label)}</li>`; lastType = t.id; }
    html += `<li>
      <span class="sk-ico">${t.ico}</span>
      <span class="h-main"><strong>${esc(p.name)}</strong>
        <small>${[p.brand, p.ref].filter(Boolean).map(esc).join(" · ")}${p.notes ? " · " + esc(p.notes) : ""}</small>
        <span class="sk-when">${scheduleText(p)}</span></span>
      <button class="edit" data-skin-edit="${p.id}" aria-label="Modifier" title="Modifier">✏️</button>
      <button class="del" data-skin-del="${p.id}" aria-label="Supprimer" title="Supprimer">×</button>
    </li>`;
  });
  $("#skinProducts").innerHTML = html || `<li class="empty">Aucun produit pour l'instant 🧴</li>`;
}

/* ---------- Formulaire produit ---------- */
$("#skType").innerHTML = SKIN_TYPES.map((t) => `<option value="${t.id}">${t.ico} ${t.label}</option>`).join("");
$("#skDays").insertAdjacentHTML("beforeend",
  SKIN_DAYS.map((d, i) => `<label class="chip"><input type="checkbox" value="${i}" checked><span>${d}</span></label>`).join("")
  + `<button type="button" class="btn-link" id="skAllDays">Tous</button>`);

function resetSkinForm() {
  skinEditId = null;
  $("#skinForm").reset();
  $("#skAm").checked = true; $("#skPm").checked = true;
  document.querySelectorAll("#skDays input").forEach((c) => (c.checked = true));
  $("#skinFormTitle").textContent = "Ajouter un produit 🧴";
  $("#skSubmit").textContent = "Ajouter";
  $("#skCancel").hidden = true;
}

$("#skAllDays").addEventListener("click", () => {
  const boxes = [...document.querySelectorAll("#skDays input")];
  const all = boxes.every((c) => c.checked);
  boxes.forEach((c) => (c.checked = !all));
});

$("#skinForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const days = [...document.querySelectorAll("#skDays input:checked")].map((c) => Number(c.value));
  const am = $("#skAm").checked, pm = $("#skPm").checked;
  if (!am && !pm) { toast("Choisis matin, soir ou les deux ☀️🌙"); return; }
  if (!days.length) { toast("Choisis au moins un jour 🗓️"); return; }
  const prod = {
    name: $("#skName").value.trim(), brand: $("#skBrand").value.trim(), ref: $("#skRef").value.trim(),
    type: $("#skType").value, am, pm, days, notes: $("#skNotes").value.trim()
  };
  const s = skin();
  if (skinEditId) {
    Object.assign(s.products.find((p) => p.id === skinEditId), prod);
    toast("Produit modifié ✨");
  } else {
    s.products.push({ id: uid(), ...prod });
    toast("Produit ajouté 🧴✨");
  }
  save();
  resetSkinForm();
  renderSkincare();
});
$("#skCancel").addEventListener("click", resetSkinForm);

$("#skinProducts").addEventListener("click", (e) => {
  const s = skin();
  const editId = e.target.dataset.skinEdit;
  const delId = e.target.dataset.skinDel;
  if (editId) {
    const p = s.products.find((x) => x.id === editId);
    skinEditId = p.id;
    $("#skName").value = p.name; $("#skBrand").value = p.brand; $("#skRef").value = p.ref;
    $("#skType").value = p.type; $("#skNotes").value = p.notes;
    $("#skAm").checked = p.am; $("#skPm").checked = p.pm;
    document.querySelectorAll("#skDays input").forEach((c) => (c.checked = p.days.includes(Number(c.value))));
    $("#skinFormTitle").textContent = "Modifier le produit ✏️";
    $("#skSubmit").textContent = "Enregistrer";
    $("#skCancel").hidden = false;
    $("#skName").focus();
    $("#skinForm").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (delId) {
    const p = s.products.find((x) => x.id === delId);
    if (!confirm(`Supprimer « ${p.name} » de ta routine ?`)) return;
    s.products = s.products.filter((x) => x.id !== delId);
    if (skinEditId === delId) resetSkinForm();
    save();
    renderSkincare();
  }
});

/* ---------- Cocher la routine ---------- */
function onRoutineCheck(e) {
  const id = e.target.dataset.skin;
  if (!id) return;
  const key = $("#skinDate").value || todayKey();
  const m = e.target.dataset.moment;
  const s = skin();
  const entry = s.log[key] = s.log[key] || {};
  const list = entry[m] || [];
  entry[m] = e.target.checked ? [...new Set([...list, id])] : list.filter((x) => x !== id);
  save();
  const before = routineState(key, m);
  renderSkincare();
  if (e.target.checked && before === "full") toast(m === "am" ? "Routine du matin terminée ☀️🎀" : "Routine du soir terminée 🌙✨");
}
$("#skinAm").addEventListener("change", onRoutineCheck);
$("#skinPm").addEventListener("change", onRoutineCheck);

/* ---------- État de la peau ---------- */
$("#skinMoods").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mood]");
  if (!b) return;
  const key = $("#skinDate").value || todayKey();
  const s = skin();
  const v = Number(b.dataset.mood);
  const cur = s.skin[key] || {};
  s.skin[key] = { ...cur, score: cur.score === v ? null : v };
  save();
  renderSkincare();
});
$("#skinNoteForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const key = $("#skinDate").value || todayKey();
  const s = skin();
  s.skin[key] = { ...(s.skin[key] || {}), note: $("#skinNote").value.trim() };
  save();
  toast("Note enregistrée 💗");
});

$("#skinDate").value = todayKey();
$("#skinDate").addEventListener("change", renderSkincare);

seedSkincare();
renderSkincare();
