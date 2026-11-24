/* =========================================================
   EMMA — scanner de code-barres (gratuit)
   - Lecture du code : bibliothèque html5-qrcode (chargée seulement au besoin)
   - Valeurs nutritionnelles : Open Food Facts, base de données ouverte et gratuite
   ========================================================= */

const SCAN_LIB_URL = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
const OFF_FIELDS = "code,product_name,product_name_fr,brands,quantity,serving_quantity,nutriments,image_front_small_url";

let scanLibPromise = null;
let scanner = null;
let scanning = false;
let scanProduct = null; // { name, brand, unit, per100: {kcal, prot, carb, fat} }

/* ---------- Chargement de la bibliothèque de lecture ---------- */
function loadScanLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (!scanLibPromise) {
    scanLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCAN_LIB_URL;
      s.onload = resolve;
      s.onerror = () => { scanLibPromise = null; s.remove(); reject(new Error("lib")); };
      document.head.appendChild(s);
    });
  }
  return scanLibPromise;
}

function getScanner() {
  if (!scanner) {
    const F = window.Html5QrcodeSupportedFormats;
    scanner = new Html5Qrcode("scanReader", {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false
    });
  }
  return scanner;
}

function scanStatus(msg, isError = false) {
  const el = $("#scanStatus");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

/* ---------- Caméra ---------- */
async function openScanner() {
  $("#scanPanel").hidden = false;
  $("#scanResult").innerHTML = "";
  scanProduct = null;
  scanStatus("Ouverture de la caméra… 📷");

  try {
    await loadScanLib();
  } catch (e) {
    scanStatus("Le scanner n'a pas pu se charger (connexion internet ?). Tape le code-barres à la main 👇", true);
    return;
  }

  if (scanning) return;
  try {
    await getScanner().start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: (w, h) => ({
          width: Math.max(50, Math.floor(Math.min(300, w * 0.85))),
          height: Math.max(50, Math.floor(Math.min(150, h * 0.5)))
        })
      },
      onCodeScanned,
      () => {} // pas de code dans l'image : on continue
    );
    scanning = true;
    scanStatus("Vise le code-barres du produit 🏷️");
  } catch (e) {
    scanStatus("Caméra indisponible ou refusée. Tape le code-barres, ou prends-le en photo 👇", true);
  }
}

async function stopScanner() {
  if (!scanner || !scanning) return;
  scanning = false;
  try { await scanner.stop(); scanner.clear(); } catch (e) { /* déjà arrêtée */ }
}

function closeScanner() {
  stopScanner();
  $("#scanPanel").hidden = true;
  $("#scanResult").innerHTML = "";
  $("#scanCode").value = "";
  scanProduct = null;
}

function onCodeScanned(text) {
  if (!scanning) return;
  stopScanner();
  if (navigator.vibrate) navigator.vibrate(60);
  $("#scanCode").value = text;
  findProduct(text);
}

/* ---------- Recherche dans Open Food Facts ---------- */
async function findProduct(raw) {
  const code = String(raw).replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) {
    scanStatus("Un code-barres contient 8 à 14 chiffres 🙏", true);
    return;
  }
  scanStatus(`Recherche du produit ${code}… 🔍`);
  $("#scanResult").innerHTML = "";

  let res;
  try {
    res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}&lc=fr`);
  } catch (e) {
    scanStatus("Pas de connexion internet 📡", true);
    return;
  }
  let json = null;
  try { json = await res.json(); } catch (e) {}

  if (!json || json.status !== 1 || !json.product) {
    scanStatus("Produit introuvable dans Open Food Facts 😕 Tu peux l'ajouter à la main dans le formulaire.", true);
    return;
  }
  showProduct(json.product);
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function showProduct(p) {
  const n = p.nutriments || {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === null && num(n["energy_100g"]) !== null) kcal = num(n["energy_100g"]) / 4.184; // kJ -> kcal

  const name = (p.product_name_fr || p.product_name || "Produit sans nom").trim();
  const brand = (p.brands || "").split(",")[0].trim();
  const unit = /\b(ml|cl|l)\b/i.test(p.quantity || "") ? "ml" : "g";
  const serving = num(p.serving_quantity);

  scanProduct = {
    name: brand ? `${name} · ${brand}` : name,
    unit,
    per100: {
      kcal: kcal ?? 0,
      prot: num(n["proteins_100g"]) ?? 0,
      carb: num(n["carbohydrates_100g"]) ?? 0,
      fat: num(n["fat_100g"]) ?? 0
    }
  };

  const img = typeof p.image_front_small_url === "string" && p.image_front_small_url.startsWith("https://")
    ? `<img src="${esc(p.image_front_small_url)}" alt="">` : "";
  const per = scanProduct.per100;

  scanStatus(kcal === null
    ? "Produit trouvé, mais sans valeurs nutritionnelles : complète-les avec « Modifier avant » ✏️"
    : "Produit trouvé ✨", kcal === null);

  $("#scanResult").innerHTML = `
    <div class="scan-product${img ? "" : " no-img"}">
      ${img}
      <div>
        <p class="pr-name">${esc(name)}</p>
        <p class="pr-portion">${esc([brand, p.quantity].filter(Boolean).join(" · "))}</p>
        <label class="scan-qty">Quantité mangée
          <input type="number" id="scanQty" min="1" max="5000" step="1" value="${Math.round(serving || 100)}"> ${unit}
        </label>
        <div class="pr-kcal" id="scanKcal"></div>
        <div class="pr-macros" id="scanMacros"></div>
        <p class="pr-note">Pour 100 ${unit} : ${Math.round(per.kcal)} kcal · P ${round(per.prot, 1)} g · G ${round(per.carb, 1)} g · L ${round(per.fat, 1)} g</p>
        <div class="pr-actions">
          <button type="button" class="btn" id="scanAdd">Ajouter au journal 🍓</button>
          <button type="button" class="btn-ghost" id="scanEdit">Modifier avant ✏️</button>
          <button type="button" class="btn-link" id="scanAgain">Scanner un autre 🏷️</button>
        </div>
        <p class="scan-source">Source : Open Food Facts</p>
      </div>
    </div>`;

  $("#scanQty").addEventListener("input", updateScanTotals);
  $("#scanAdd").addEventListener("click", () => { if (fillFromScan()) { $("#foodForm").requestSubmit(); closeScanner(); } });
  $("#scanEdit").addEventListener("click", () => {
    if (!fillFromScan()) return;
    closeScanner();
    $("#foodName").focus();
    $("#foodName").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("#scanAgain").addEventListener("click", () => { $("#scanCode").value = ""; openScanner(); });
  updateScanTotals();
}

function scanTotals() {
  const qty = Math.max(0, Number($("#scanQty").value) || 0);
  const f = qty / 100;
  const p = scanProduct.per100;
  return { qty, kcal: Math.round(p.kcal * f), prot: round(p.prot * f, 1), carb: round(p.carb * f, 1), fat: round(p.fat * f, 1) };
}

function updateScanTotals() {
  const t = scanTotals();
  $("#scanKcal").innerHTML = `${t.kcal} <small>kcal</small>`;
  $("#scanMacros").innerHTML = `<span>Prot. ${t.prot} g</span><span>Gluc. ${t.carb} g</span><span>Lip. ${t.fat} g</span>`;
}

function fillFromScan() {
  if (!scanProduct) return false;
  const t = scanTotals();
  if (!t.qty) { toast("Indique la quantité mangée 🙏"); $("#scanQty").focus(); return false; }
  $("#foodName").value = `${scanProduct.name} (${t.qty} ${scanProduct.unit})`;
  $("#foodKcal").value = t.kcal;
  $("#foodProt").value = t.prot;
  $("#foodCarb").value = t.carb;
  $("#foodFat").value = t.fat;
  return true;
}

/* ---------- Évènements ---------- */
$("#scanOpen").addEventListener("click", openScanner);
$("#scanClose").addEventListener("click", closeScanner);

$("#scanManual").addEventListener("submit", (e) => {
  e.preventDefault();
  stopScanner();
  findProduct($("#scanCode").value);
});

// Photo d'un code-barres (si la caméra en direct ne marche pas)
$("#scanFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  scanStatus("Lecture du code-barres… 🔍");
  try {
    await loadScanLib();
    await stopScanner();
    const code = await getScanner().scanFile(file, false);
    $("#scanCode").value = code;
    findProduct(code);
  } catch (err) {
    scanStatus("Aucun code-barres lisible sur cette photo. Rapproche-toi et évite les reflets, ou tape le code 👇", true);
  }
});

// Ancienne analyse photo retirée : on efface une éventuelle clé API restée dans le navigateur
try { localStorage.removeItem("emma-anthropic-key"); } catch (e) {}

// Couper la caméra quand on change d'onglet ou de page
document.querySelectorAll(".nav-link").forEach((b) => b.addEventListener("click", stopScanner));
document.addEventListener("visibilitychange", () => { if (document.hidden) stopScanner(); });
