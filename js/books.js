/* =========================================================
   EMMA — suivi de lecture
   Bibliothèque (lu / en cours / à lire), notes, avis,
   recherche par titre ou auteur·rice, et remplissage
   automatique via Open Library (gratuit, sans compte).
   ========================================================= */

const BK_STATUS = {
  "lu":       { label: "Lu ✅",       order: 1 },
  "en-cours": { label: "En cours 📖", order: 0 },
  "a-lire":   { label: "À lire 🔖",  order: 2 }
};

let bkEditId = null;
let bkRating = 0;
let bkCover = "";
let olResults = [];

/* ---------- Données ---------- */
function books() {
  if (!Array.isArray(data.books)) data.books = [];
  if (!data.readingGoal) data.readingGoal = 12;
  return data.books;
}

/* ---------- Recherche sans accents ni majuscules ---------- */
function bkNorm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
// Surligne la recherche dans un texte (en ignorant accents et majuscules)
function bkMark(text, q) {
  text = String(text || "");
  if (!q) return esc(text);
  let flat = "";
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const n = bkNorm(text[i]) || text[i].toLowerCase();
    for (let k = 0; k < n.length; k++) { flat += n[k]; map.push(i); }
  }
  const at = flat.indexOf(q);
  if (at < 0) return esc(text);
  const start = map[at];
  const end = map[at + q.length - 1] + 1;
  return esc(text.slice(0, start)) + "<mark>" + esc(text.slice(start, end)) + "</mark>" + esc(text.slice(end));
}

/* ---------- Affichage ---------- */
function bkStars(n) {
  return n ? "★".repeat(n) + "☆".repeat(5 - n) : "";
}
function bkDateText(b) {
  const fmt = (k) => fmtDate(fromKey(k), { day: "numeric", month: "short", year: "numeric" });
  if (b.status === "lu" && b.end) return `Lu le ${fmt(b.end)}`;
  if (b.status === "en-cours" && b.start) return `Commencé le ${fmt(b.start)}`;
  if (b.start) return `Commencé le ${fmt(b.start)}`;
  return "";
}
function bkCoverHtml(url) {
  return typeof url === "string" && url.startsWith("https://")
    ? `<img class="bk-cover" src="${esc(url)}" alt="" loading="lazy">`
    : `<span class="bk-cover-ph" aria-hidden="true">📖</span>`;
}
function bkSort(a, b) {
  const s = BK_STATUS[a.status].order - BK_STATUS[b.status].order;
  if (s) return s;
  return (b.end || b.start || "").localeCompare(a.end || a.start || "") || a.title.localeCompare(b.title);
}
function bkItem(b, q) {
  const meta = [
    `<span class="bk-badge ${b.status}">${BK_STATUS[b.status].label}</span>`,
    b.rating ? `<span class="bk-stars" aria-label="${b.rating} sur 5">${bkStars(b.rating)}</span>` : "",
    bkDateText(b) ? `<span>${bkDateText(b)}</span>` : "",
    b.pages ? `<span>${b.pages} pages</span>` : "",
    b.genre ? `<span>${esc(b.genre)}</span>` : ""
  ].filter(Boolean).join("");
  return `<div class="bk-item">
    ${bkCoverHtml(b.cover)}
    <div class="bk-info">
      <p class="bk-title">${bkMark(b.title, q)}</p>
      <button type="button" class="bk-author-link" data-author="${esc(b.author)}">${bkMark(b.author, q)}</button>
      <div class="bk-meta">${meta}</div>
      ${b.notes ? `<p class="bk-notes">« ${esc(b.notes)} »</p>` : ""}
    </div>
    <div class="bk-actions">
      <button class="edit" data-bk-edit="${b.id}" aria-label="Modifier" title="Modifier">✏️</button>
      <button class="del" data-bk-del="${b.id}" aria-label="Supprimer" title="Supprimer">×</button>
    </div>
  </div>`;
}

function renderBooks() {
  const list = books();
  const year = String(new Date().getFullYear());
  const read = list.filter((b) => b.status === "lu");
  const readYear = read.filter((b) => (b.end || "").startsWith(year));
  const goal = Number(data.readingGoal) || 12;

  // Statistiques
  $("#bkYearValue").textContent = `${readYear.length} / ${goal}`;
  $("#bkYearBar").style.width = `${Math.min(100, (readYear.length / goal) * 100)}%`;
  $("#bkYearSub").textContent = readYear.length >= goal ? "Objectif atteint, bravo 🎉📚" : `Encore ${goal - readYear.length} pour ton objectif ${year}`;
  const reading = list.filter((b) => b.status === "en-cours");
  $("#bkReading").textContent = reading.length;
  $("#bkReadingSub").textContent = reading.length ? reading.map((b) => b.title).slice(0, 2).join(", ") : "livre";
  $("#bkToRead").textContent = list.filter((b) => b.status === "a-lire").length;
  $("#bkPages").textContent = readYear.reduce((a, b) => a + (Number(b.pages) || 0), 0).toLocaleString("fr-FR");
  $("#bkTotal").textContent = `${read.length} livre${read.length > 1 ? "s" : ""} lu${read.length > 1 ? "s" : ""} au total`;
  $("#bkGoal").value = goal;

  // Suggestions pour les champs auteur et genre
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  $("#bkAuthors").innerHTML = uniq(list.map((b) => b.author)).map((a) => `<option value="${esc(a)}">`).join("");
  $("#bkGenres").innerHTML = uniq(list.map((b) => b.genre)).map((g) => `<option value="${esc(g)}">`).join("");

  // Filtre + recherche
  const q = bkNorm($("#bkSearch").value);
  const filter = (document.querySelector('input[name="bkFilter"]:checked') || {}).value || "tous";
  let shown = list.filter((b) => filter === "tous" || b.status === filter);
  if (q) shown = shown.filter((b) => bkNorm(b.title).includes(q) || bkNorm(b.author).includes(q));

  const out = $("#bkList");
  const summary = $("#bkSummary");

  if (!list.length) {
    summary.textContent = "";
    out.innerHTML = `<p class="empty">Ta bibliothèque est vide pour l'instant. Ajoute ton premier livre 📚</p>`;
    return;
  }
  if (!shown.length) {
    summary.innerHTML = q ? `Aucun livre trouvé pour « <strong>${esc($("#bkSearch").value.trim())}</strong> » 🥺` : "Aucun livre dans cette catégorie.";
    out.innerHTML = "";
    return;
  }

  if (q) {
    // Regroupé par auteur·rice : on voit d'un coup tout ce qu'on a lu de cette personne
    const groups = {};
    shown.forEach((b) => { (groups[b.author] = groups[b.author] || []).push(b); });
    const authors = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length || a.localeCompare(b));
    const authorMatch = authors.filter((a) => bkNorm(a).includes(q));
    if (authorMatch.length === 1) {
      const a = authorMatch[0];
      const nRead = list.filter((b) => b.author === a && b.status === "lu").length;
      const de = /^[aeiouyhâàéèêëîïôöûüœ]/i.test(a) ? "d'" : "de ";
      summary.innerHTML = `Tu as lu <strong>${nRead} livre${nRead > 1 ? "s" : ""}</strong> ${de}<strong>${esc(a)}</strong> ✍️`;
    } else {
      summary.innerHTML = `<strong>${shown.length}</strong> livre${shown.length > 1 ? "s" : ""} trouvé${shown.length > 1 ? "s" : ""}`;
    }
    out.innerHTML = authors.map((a) => {
      const all = list.filter((b) => b.author === a);
      const c = (s) => all.filter((b) => b.status === s).length;
      const parts = [c("lu") && `${c("lu")} lu${c("lu") > 1 ? "s" : ""}`, c("en-cours") && `${c("en-cours")} en cours`, c("a-lire") && `${c("a-lire")} à lire`].filter(Boolean).join(" · ");
      return `<div class="bk-author-group">
        <div class="bk-author-head"><h3>✍️ ${bkMark(a, q)}</h3><span>${parts}</span></div>
        ${groups[a].sort(bkSort).map((b) => bkItem(b, q)).join("")}
      </div>`;
    }).join("");
  } else {
    summary.innerHTML = `<strong>${shown.length}</strong> livre${shown.length > 1 ? "s" : ""}`;
    out.innerHTML = shown.slice().sort(bkSort).map((b) => bkItem(b, "")).join("");
  }
}

/* ---------- Note en étoiles ---------- */
function setStars(n) {
  bkRating = n;
  $("#bkStars").innerHTML = [1, 2, 3, 4, 5].map((i) =>
    `<button type="button" data-star="${i}" class="${i <= n ? "on" : ""}" aria-label="${i} étoile${i > 1 ? "s" : ""}" aria-pressed="${i <= n}">★</button>`
  ).join("");
}
$("#bkStars").addEventListener("click", (e) => {
  const b = e.target.closest("[data-star]");
  if (!b) return;
  const n = Number(b.dataset.star);
  setStars(n === bkRating ? 0 : n);
});

/* ---------- Couverture ---------- */
function setCover(url) {
  bkCover = url || "";
  $("#bkCoverPreview").hidden = !bkCover;
  if (bkCover) $("#bkCoverImg").src = bkCover; else $("#bkCoverImg").removeAttribute("src");
}
$("#bkCoverRemove").addEventListener("click", () => setCover(""));

/* ---------- Formulaire ---------- */
function resetBookForm() {
  bkEditId = null;
  $("#bookForm").reset();
  $("#bkStart").value = ""; $("#bkEnd").value = "";
  setStars(0);
  setCover("");
  $("#bkFormTitle").textContent = "Ajouter un livre 📖";
  $("#bkSubmit").textContent = "Ajouter";
  $("#bkCancel").hidden = true;
}

$("#bookForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const status = $("#bkStatus").value;
  const b = {
    title: $("#bkTitle").value.trim(),
    author: $("#bkAuthor").value.trim(),
    status,
    pages: Number($("#bkPagesInput").value) || null,
    start: $("#bkStart").value || "",
    end: $("#bkEnd").value || "",
    rating: bkRating,
    genre: $("#bkGenre").value.trim(),
    notes: $("#bkNotes").value.trim(),
    cover: bkCover
  };
  // Dates automatiques si oubliées
  if (status === "lu" && !b.end) b.end = todayKey();
  if (status === "en-cours" && !b.start) b.start = todayKey();

  const list = books();
  if (bkEditId) {
    Object.assign(list.find((x) => x.id === bkEditId), b);
    toast("Livre modifié ✨");
  } else {
    list.push({ id: uid(), ...b });
    toast(status === "lu" ? "Livre ajouté, bravo 📚🎀" : "Livre ajouté 📖");
  }
  save();
  resetBookForm();
  $("#olResults").innerHTML = "";
  renderBooks();
});
$("#bkCancel").addEventListener("click", resetBookForm);

$("#bkGoal").addEventListener("change", (e) => {
  const v = Number(e.target.value);
  if (v >= 1) { data.readingGoal = v; save(); renderBooks(); }
});

/* ---------- Liste : modifier, supprimer, cliquer un auteur ---------- */
$("#bkList").addEventListener("click", (e) => {
  const author = e.target.closest("[data-author]");
  if (author) {
    $("#bkSearch").value = author.dataset.author;
    document.querySelector('input[name="bkFilter"][value="tous"]').checked = true;
    renderBooks();
    $("#bkSearch").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const editId = e.target.dataset.bkEdit;
  const delId = e.target.dataset.bkDel;
  const list = books();
  if (editId) {
    const b = list.find((x) => x.id === editId);
    bkEditId = b.id;
    $("#bkTitle").value = b.title; $("#bkAuthor").value = b.author; $("#bkStatus").value = b.status;
    $("#bkPagesInput").value = b.pages || ""; $("#bkStart").value = b.start || ""; $("#bkEnd").value = b.end || "";
    $("#bkGenre").value = b.genre || ""; $("#bkNotes").value = b.notes || "";
    setStars(b.rating || 0);
    setCover(b.cover);
    $("#bkFormTitle").textContent = "Modifier le livre ✏️";
    $("#bkSubmit").textContent = "Enregistrer";
    $("#bkCancel").hidden = false;
    $("#bkFormTitle").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (delId) {
    const b = list.find((x) => x.id === delId);
    if (!confirm(`Supprimer « ${b.title} » de ta bibliothèque ?`)) return;
    data.books = list.filter((x) => x.id !== delId);
    if (bkEditId === delId) resetBookForm();
    save();
    renderBooks();
  }
});

$("#bkSearch").addEventListener("input", renderBooks);
$("#bkFilters").addEventListener("change", renderBooks);

/* ---------- Open Library : remplir la fiche automatiquement ---------- */
$("#olForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#olQuery").value.trim();
  const out = $("#olResults");
  if (q.length < 2) return;
  out.innerHTML = `<li class="ol-status">Recherche… 🔍</li>`;
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=title,author_name,cover_i,number_of_pages_median,first_publish_year&limit=6`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    olResults = (json.docs || []).filter((d) => d.title);
  } catch (err) {
    out.innerHTML = `<li class="ol-status">Recherche impossible (connexion internet ?) 📡 Tu peux remplir la fiche à la main.</li>`;
    return;
  }
  if (!olResults.length) {
    out.innerHTML = `<li class="ol-status">Aucun résultat 🥺 Remplis la fiche à la main.</li>`;
    return;
  }
  out.innerHTML = olResults.map((d, i) => {
    const cover = d.cover_i ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(d.cover_i)}-S.jpg` : "";
    const sub = [(d.author_name || [])[0], d.first_publish_year, d.number_of_pages_median ? `${d.number_of_pages_median} p.` : ""].filter(Boolean).map(esc).join(" · ");
    return `<li><button type="button" data-ol="${i}">${bkCoverHtml(cover)}<span><strong>${esc(d.title)}</strong><small>${sub}</small></span></button></li>`;
  }).join("");
});

$("#olResults").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-ol]");
  if (!btn) return;
  const d = olResults[Number(btn.dataset.ol)];
  $("#bkTitle").value = d.title;
  $("#bkAuthor").value = (d.author_name || [])[0] || "";
  if (d.number_of_pages_median) $("#bkPagesInput").value = d.number_of_pages_median;
  setCover(d.cover_i ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(d.cover_i)}-M.jpg` : "");
  $("#olResults").innerHTML = "";
  $("#olQuery").value = "";
  $("#bkStatus").focus();
  toast("Fiche remplie ✨ Vérifie et ajoute ta note");
});

setStars(0);
renderBooks();
