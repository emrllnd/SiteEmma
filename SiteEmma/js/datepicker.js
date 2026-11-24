/* =========================================================
   EMMA — sélecteur de date personnalisé (remplace celui du navigateur)
   Usage : EmmaDatePicker.enhance(input)  — input de type "date"
   Le champ d'origine reste dans la page (caché) : sa valeur reste
   au format AAAA-MM-JJ et l'évènement "change" est déclenché.
   ========================================================= */

const EmmaDatePicker = (() => {
  const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const DOW = ["L", "M", "M", "J", "V", "S", "D"];
  const valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

  const pad = (n) => String(n).padStart(2, "0");
  const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const CAL_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

  let pop = null;      // la fenêtre du calendrier
  let current = null;  // { input, button, view }

  function buildPopover() {
    pop = document.createElement("div");
    pop.className = "dp";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Choisir une date");
    document.body.appendChild(pop);

    pop.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = e.target.closest("[data-dp]");
      if (!t) return;
      const action = t.dataset.dp;
      if (action === "prev") { current.view.setMonth(current.view.getMonth() - 1); render(); }
      else if (action === "next") { current.view.setMonth(current.view.getMonth() + 1); render(); }
      else if (action === "today") choose(toKey(new Date()));
      else if (action === "clear") choose("");
      else if (action === "day") choose(t.dataset.key);
    });

    document.addEventListener("click", (e) => {
      if (current && !current.button.contains(e.target)) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && current) { const b = current.button; close(); b.focus(); }
    });
    window.addEventListener("resize", () => current && position());
    window.addEventListener("scroll", () => current && position(), true);
  }

  function render() {
    const { input, view } = current;
    const y = view.getFullYear();
    const m = view.getMonth();
    const selected = input.value;
    const today = toKey(new Date());
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const first = new Date(y, m, 1 - offset);

    let days = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
      const key = toKey(d);
      const cls = ["dp-day"];
      if (d.getMonth() !== m) cls.push("out");
      if (key === today) cls.push("today");
      if (key === selected) cls.push("sel");
      days += `<button type="button" class="${cls.join(" ")}" data-dp="day" data-key="${key}" aria-label="${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}">${d.getDate()}</button>`;
    }

    pop.innerHTML = `
      <div class="dp-head">
        <button type="button" class="dp-nav" data-dp="prev" aria-label="Mois précédent">‹</button>
        <p class="dp-title">${MONTHS[m]} <span>${y}</span></p>
        <button type="button" class="dp-nav" data-dp="next" aria-label="Mois suivant">›</button>
      </div>
      <div class="dp-grid">
        ${DOW.map((d) => `<span class="dp-dow">${d}</span>`).join("")}
        ${days}
      </div>
      <div class="dp-foot">
        <button type="button" class="dp-link" data-dp="today">Aujourd'hui</button>
        ${input.dataset.clearable !== undefined ? `<button type="button" class="dp-link muted" data-dp="clear">Effacer</button>` : ""}
      </div>`;
  }

  function position() {
    const r = current.button.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    let left = r.left;
    if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
    left = Math.max(12, left);
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 12 && r.top - h - 8 > 12) top = r.top - h - 8;
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${top + window.scrollY}px`;
  }

  function open(input, button) {
    if (!pop) buildPopover();
    if (current && current.input === input) { close(); return; }
    close();
    const base = input.value ? fromKey(input.value) : new Date();
    current = { input, button, view: new Date(base.getFullYear(), base.getMonth(), 1) };
    button.setAttribute("aria-expanded", "true");
    render();
    pop.classList.add("open");
    position();
  }

  function close() {
    if (!current) return;
    current.button.setAttribute("aria-expanded", "false");
    pop.classList.remove("open");
    current = null;
  }

  function choose(key) {
    const input = current.input;
    const button = current.button;
    close();
    input.value = key;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    button.focus();
  }

  function updateLabel(input, button) {
    const v = valueDesc.get.call(input);
    const label = button.querySelector(".date-btn-text");
    if (v) {
      label.textContent = fromKey(v).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
      button.classList.remove("empty");
    } else {
      label.textContent = input.dataset.placeholder || "Choisir une date";
      button.classList.add("empty");
    }
  }

  function enhance(input) {
    if (input.dataset.dpReady) return;
    input.dataset.dpReady = "1";

    const button = document.createElement("button");
    button.type = "button";
    button.className = `date-btn ${input.className}`.trim();
    if (input.id) button.id = `${input.id}Btn`;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = `<span class="date-btn-ico">${CAL_ICON}</span><span class="date-btn-text"></span>`;

    input.hidden = true;
    input.removeAttribute("required");
    input.insertAdjacentElement("afterend", button);

    // Les libellés <label for="..."> ouvrent aussi le calendrier
    if (input.id) {
      document.querySelectorAll(`label[for="${input.id}"]`).forEach((l) => {
        l.addEventListener("click", (e) => { e.preventDefault(); button.focus(); });
      });
    }

    // Garder le texte du bouton à jour quand le code change la valeur
    Object.defineProperty(input, "value", {
      get() { return valueDesc.get.call(this); },
      set(v) { valueDesc.set.call(this, v); updateLabel(input, button); },
      configurable: true
    });

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      open(input, button);
    });

    updateLabel(input, button);
  }

  return { enhance, close };
})();
