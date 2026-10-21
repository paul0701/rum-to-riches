import { Api, session, cache } from "./api.js";
import * as V from "./views.js";
import { renderChart, tickChart } from "./chart.js";
import { PIN_RULES, pinProblem } from "./pin.js";

const $ = (sel) => document.querySelector(sel);
const S = {
  state: null, catalog: null, captain: "", playerId: "", offset: 0,
  tab: "fleet", marketPort: null, marketShip: null, yardPort: null,
  offline: false, busy: false, lastResolve: 0, authMode: "login",
  now: () => Date.now() + S.offset
};

// ---------- feedback ----------
function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = `toast${isError ? " error" : ""}`;
  el.textContent = msg;
  el.dataset.testid = isError ? "toast-error" : "toast";
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), isError ? 6000 : 4000);
}
function setSync(state, text) {
  const el = $("#sync");
  el.dataset.state = state;
  el.textContent = text;
}

// ---------- screens ----------
function showAuth(error = "") {
  $("#boot").hidden = true;
  $("#game-screen").hidden = true;
  $("#auth-screen").hidden = false;
  setAuthMode(S.authMode);
  $("#auth-error").textContent = error;
}
function showGame() {
  $("#boot").hidden = true;
  $("#auth-screen").hidden = true;
  $("#game-screen").hidden = false;
  render();
}

function absorb(data, fromCache = false) {
  S.state = data.state;
  if (data.catalog) S.catalog = data.catalog;
  if (data.captain) S.captain = data.captain;
  if (data.playerId) S.playerId = data.playerId;
  if (!fromCache && data.serverNow) S.offset = data.serverNow - Date.now();
  if (!S.marketPort) S.marketPort = S.state.ships[0]?.port || S.catalog.rules.homePort;
  if (!fromCache) cache.set(S.playerId, { state: S.state, catalog: S.catalog, captain: S.captain, playerId: S.playerId });
}

function render() {
  if (!S.state || !S.catalog) return;
  const sailing = S.state.voyages.length;
  $("#hud-captain").textContent = S.captain;
  $("#hud-gold").textContent = V.fmt(S.state.gold);
  $("#hud-fleet").textContent = S.state.ships.length;
  $("#hud-voyages").textContent = sailing;
  $("#offline-banner").hidden = !S.offline;
  if (S.offline) setSync("offline", "Offline cache");
  document.querySelectorAll("[data-tab]").forEach((t) => t.classList.toggle("active", t.dataset.tab === S.tab));
  const views = { fleet: V.fleetView, market: V.marketView, shipyard: V.shipyardView, log: V.logView };
  const keepName = $("#yard-name")?.value;
  $("#panel").innerHTML = views[S.tab](S);
  if (keepName && $("#yard-name")) $("#yard-name").value = keepName;
  renderChart(S, $("#chart"));
  tick();
}

// ---------- server calls ----------
async function loadGame() {
  const s = session.get();
  if (!s) return showAuth();
  S.playerId = s.playerId;
  S.captain = s.captain;
  setSync("saving", "Loading");
  try {
    const data = await Api.load();
    S.offline = false;
    absorb(data);
    setSync("saved", "Saved");
    showGame();
    if (data.resolved) toast(`${data.resolved} voyage(s) made port while you were away. Collect your gold!`);
  } catch (e) {
    if (e.status === 401) {
      session.clear();
      return showAuth(e.message);
    }
    const cached = cache.get(s.playerId);
    if (cached && cached.state) {
      S.offline = true;
      absorb(cached, true);
      showGame();
      toast(e.message, true);
    } else {
      showAuth(e.message);
    }
  }
}

async function act(call, body, { silent = false } = {}) {
  if (S.offline) return toast("You are offline. Reconnect to keep playing.", true);
  if (S.busy) return;
  S.busy = true;
  setSync("saving", "Saving");
  try {
    const data = await call(body);
    absorb(data);
    setSync("saved", "Saved");
    render();
    if (data.message && !silent) toast(data.message);
    return data;
  } catch (e) {
    setSync("error", "Not saved");
    if (e.status === 401) {
      session.clear();
      showAuth(e.message);
    } else if (e.status === 0) {
      S.offline = true;
      render();
      toast(e.message, true);
    } else {
      toast(e.message, true);
    }
    throw e;
  } finally {
    S.busy = false;
  }
}
const save = (body) => act(Api.save, body).catch(() => null);

// ---------- ticking clock ----------
function tick() {
  if (!S.state) return;
  const now = S.now();
  document.querySelectorAll("[data-countdown]").forEach((el) => {
    const left = Number(el.dataset.countdown) - now;
    el.textContent = left > 0 ? `${V.duration(left)} to port` : "Making port…";
  });
  document.querySelectorAll("[data-progress]").forEach((el) => {
    const d = Number(el.dataset.depart);
    const a = Number(el.dataset.arrive);
    el.style.width = `${Math.min(100, ((now - d) / (a - d)) * 100)}%`;
  });
  tickChart(S, $("#chart"));
  const due = S.state.voyages.some((v) => v.status === "sailing" && v.arriveAt <= now);
  if (due && !S.offline && !S.busy && now - S.lastResolve > 5000) {
    S.lastResolve = now;
    act(Api.voyages, { action: "resolve" }).catch(() => null);
  }
}

// ---------- dialogs ----------
const dialog = $("#dialog");
function openDialog(html, onMount) {
  dialog.innerHTML = html;
  dialog.showModal();
  onMount?.();
}
dialog.addEventListener("click", (e) => {
  if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
});

function openDispatch(ship) {
  openDialog(V.dispatchDialog(S, ship), () => {
    const form = $("#dispatch-form");
    const update = () => {
      const to = form.querySelector("input[name=to]:checked")?.value;
      const escortIds = [...form.querySelectorAll("input[name=escort]:checked")].map((i) => i.value);
      $("#dispatch-estimate").innerHTML = to ? V.dispatchEstimate(S, ship, to, escortIds) : "";
      return { to, escortIds };
    };
    update();
    form.addEventListener("change", update);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { to, escortIds } = update();
      if (escortIds.length > 4) return ($("#dispatch-error").textContent = "At most 4 escorts per voyage.");
      try {
        await act(Api.save, { action: "dispatch", shipId: ship.id, escortIds, to });
        dialog.close();
        S.tab = "fleet";
        render();
      } catch (err) {
        $("#dispatch-error").textContent = err.message;
      }
    });
  });
}

const findShip = (id) => S.state.ships.find((s) => s.id === id);

// ---------- panel actions ----------
const handlers = {
  sail: (el) => openDispatch(findShip(el.dataset.id)),
  trade: (el) => {
    const ship = findShip(el.dataset.id);
    S.marketPort = ship.port;
    S.marketShip = ship.id;
    S.tab = "market";
    render();
  },
  repair: (el) => save({ action: "repair", shipId: el.dataset.id }),
  upgrade: (el) => openDialog(V.upgradeDialog(S, findShip(el.dataset.id))),
  doUpgrade: async (el) => {
    await save({ action: "upgrade", shipId: el.dataset.id, kind: el.dataset.kind });
    if (dialog.open) dialog.innerHTML = V.upgradeDialog(S, findShip(el.dataset.id));
  },
  collect: (el) => act(Api.voyages, { action: "collect", voyageId: el.dataset.id }).catch(() => null),
  collectAll: () => act(Api.voyages, { action: "collectAll" }).catch(() => null),
  buy: (el) => trade("buyCargo", el.dataset.good),
  sell: (el) => trade("sellCargo", el.dataset.good),
  buyShip: (el) => {
    const name = $("#yard-name").value.trim();
    if (!name) return toast("Give your new ship a name first.", true);
    save({ action: "buyShip", type: el.dataset.type, name, port: S.yardPort }).then((d) => {
      if (d && $("#yard-name")) $("#yard-name").value = "";
    });
  }
};

function trade(action, good) {
  const qty = Number(document.querySelector(`[data-qty="${good}"]`).value);
  if (!Number.isInteger(qty) || qty < 1) return toast("Enter a whole number of crates.", true);
  save({ action, shipId: S.marketShip, good, qty });
}

function onAction(e) {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  handlers[el.dataset.action]?.(el);
}
$("#panel").addEventListener("click", onAction);
dialog.addEventListener("click", onAction);

$("#panel").addEventListener("change", (e) => {
  if (e.target.id === "market-port") { S.marketPort = e.target.value; S.marketShip = null; render(); }
  if (e.target.id === "market-ship") { S.marketShip = e.target.value; render(); }
  if (e.target.id === "yard-port") { S.yardPort = e.target.value; }
});

document.querySelectorAll("[data-tab]").forEach((t) =>
  t.addEventListener("click", () => { S.tab = t.dataset.tab; render(); }));

$("#chart").addEventListener("click", (e) => {
  const g = e.target.closest("[data-port]");
  if (!g) return;
  S.marketPort = g.dataset.port;
  S.marketShip = null;
  S.tab = "market";
  render();
});

$("#logout-btn").addEventListener("click", async () => {
  try { await Api.auth({ action: "logout" }); } catch { /* already gone */ }
  session.clear();
  S.state = null;
  showAuth();
});

// ---------- auth ----------
const AUTH_LABELS = { login: "Sign in", register: "Enlist as captain", recover: "Reset PIN" };
function setAuthMode(mode) {
  S.authMode = mode;
  const form = $("#auth-form");
  document.querySelectorAll("[data-auth-tab]").forEach((t) => t.classList.toggle("active", t.dataset.authTab === mode));
  form.querySelector("[data-field=pin]").hidden = mode === "recover";
  form.querySelector("[data-field=email]").hidden = mode === "login";
  form.querySelector("[data-field=newPin]").hidden = mode !== "recover";
  form.querySelector("[data-email-note]").textContent =
    mode === "register" ? "(optional — the only way to reset a forgotten PIN)" : "(the one you enlisted with)";
  form.pin.autocomplete = mode === "register" ? "new-password" : "current-password";
  // The PIN rules only apply to a NEW PIN, so they show on Enlist and Lost PIN, never on Sign in.
  form.querySelector("[data-pin-rules=pin]").hidden = mode !== "register";
  form.querySelector("[data-pin-rules=newPin]").hidden = mode !== "recover";
  paintPinRules("pin");
  paintPinRules("newPin");
  hideSuggestions();
  $("#auth-submit").textContent = AUTH_LABELS[mode];
  $("#auth-error").textContent = "";
}
document.querySelectorAll("[data-auth-tab]").forEach((t) => t.addEventListener("click", () => setAuthMode(t.dataset.authTab)));

// Live PIN rule list: neutral until typing starts, then a tick or a cross per rule.
function paintPinRules(field) {
  const list = document.querySelector(`[data-pin-rules=${field}]`);
  const value = $("#auth-form")[field].value;
  list.innerHTML = PIN_RULES.filter((r) => !r.hidden).map((r) => {
    const state = value ? (r.ok(value) ? "ok" : "bad") : "idle";
    const mark = state === "ok" ? "\u2713" : state === "bad" ? "\u2717" : "\u2022";
    return `<li class="${state}"><span aria-hidden="true">${mark}</span> ${r.text}</li>`;
  }).join("");
}
["pin", "newPin"].forEach((f) => $("#auth-form")[f].addEventListener("input", () => paintPinRules(f)));

// Taken-name suggestions: tap one to drop it into the name box.
function hideSuggestions() {
  $("#name-suggest").hidden = true;
  $("#name-suggest-list").innerHTML = "";
}
function showSuggestions(names) {
  const list = $("#name-suggest-list");
  list.innerHTML = "";
  names.forEach((n) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = n;
    b.dataset.testid = "name-suggestion";
    b.addEventListener("click", () => {
      $("#auth-form").captain.value = n;
      hideSuggestions();
      $("#auth-error").textContent = "";
      $("#auth-form").pin.focus();
    });
    list.appendChild(b);
  });
  $("#name-suggest").hidden = names.length === 0;
}
$("#auth-form").captain.addEventListener("input", hideSuggestions);

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const mode = S.authMode;
  const body = { action: mode, captain: f.captain.value.trim() };
  if (mode !== "recover") body.pin = f.pin.value.trim();
  if (mode !== "login") body.email = f.email.value.trim();
  if (mode === "recover") body.newPin = f.newPin.value.trim();
  const pin = mode === "recover" ? body.newPin : body.pin;
  if (!body.captain) return ($("#auth-error").textContent = "Enter your captain name.");
  if (!/^\d{4,6}$/.test(pin)) return ($("#auth-error").textContent = "PIN must be 4 to 6 digits.");
  if (mode !== "login") {
    const problem = pinProblem(pin);
    if (problem) return ($("#auth-error").textContent = problem);
  }
  if (mode === "register" && body.email === "") delete body.email;
  const btn = $("#auth-submit");
  btn.disabled = true;
  try {
    const data = await Api.auth(body);
    session.set({ token: data.token, playerId: data.playerId, captain: data.captain });
    f.reset();
    S.tab = "fleet";
    S.marketPort = null;
    await loadGame();

// Installable app: the service worker caches the shell only, never the API.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { /* not installable here */ }));
}
    if (mode === "register") toast(`Welcome aboard, Captain ${data.captain}. Your sloop awaits in Port Royal.`);
    if (mode === "recover") toast("PIN reset. Fair winds, Captain.");
  } catch (err) {
    $("#auth-error").textContent = err.message;
    if (mode === "register" && err.status === 409 && err.data?.suggestions?.length) showSuggestions(err.data.suggestions);
  } finally {
    btn.disabled = false;
  }
});

// ---------- boot ----------
setInterval(tick, 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && session.get() && !S.busy) loadGame();

// Installable app: the service worker caches the shell only, never the API.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { /* not installable here */ }));
}
});
window.addEventListener("online", () => session.get() && loadGame());
loadGame();

// Installable app: the service worker caches the shell only, never the API.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { /* not installable here */ }));
}
