// Pure HTML builders for each panel. All user-provided text is escaped.
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const fmt = (n) => Math.round(n).toLocaleString("en-GB");
export const pct = (n) => `${Math.round(n * 100)}%`;
export const routeKey = (a, b) => [a, b].sort().join("|");
export const attackChance = (risk, escortCannons) =>
  Math.min(0.9, Math.max(0.03, risk * (1 - Math.min(0.6, escortCannons / 40))));

export function duration(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
}

const portName = (S, id) => S.catalog.ports[id]?.name ?? id;
const cargoCount = (ship) => Object.values(ship.cargo).reduce((a, b) => a + b, 0);
const cargoText = (S, cargo) =>
  Object.entries(cargo).map(([g, q]) => `${q} ${S.catalog.goods[g].name}`).join(", ") || "Empty hold";
const shipById = (S, id) => S.state.ships.find((s) => s.id === id);
const hullClass = (r) => (r < 0.4 ? "low" : r < 0.7 ? "mid" : "");

export function hullBar(ship) {
  const r = ship.hull / ship.stats.maxHull;
  return `<div class="bar-label"><span>Hull</span><span>${ship.hull} / ${ship.stats.maxHull}</span></div>
    <div class="bar ${hullClass(r)}"><i style="width:${pct(r)}"></i></div>`;
}

// ---------- Fleet ----------
function voyageCard(S, v) {
  const lead = shipById(S, v.leadId);
  const escorts = v.escortIds.map((id) => shipById(S, id)?.name).filter(Boolean);
  const done = v.status === "completed";
  const head = `<div class="ship-head">
      <span class="route-line">${esc(lead?.name)} &mdash; ${esc(portName(S, v.from))} &rarr; ${esc(portName(S, done ? v.finalPort : v.to))}</span>
      ${escorts.length ? `<span class="tag escort">${escorts.length} escort${escorts.length > 1 ? "s" : ""}</span>` : ""}
    </div>
    ${escorts.length ? `<p class="muted" style="margin:.25rem 0 .5rem">Guarded by ${escorts.map(esc).join(", ")}</p>` : ""}`;
  if (!done) {
    return `<article class="voyage" data-testid="voyage-${v.id}">
      ${head}
      <div class="bar-label"><span>Cargo: ${esc(cargoText(S, v.cargo))}</span><span class="countdown" data-countdown="${v.arriveAt}" data-testid="voyage-countdown-${v.id}"></span></div>
      <div class="bar sea"><i data-progress data-depart="${v.departAt}" data-arrive="${v.arriveAt}"></i></div>
    </article>`;
  }
  const o = v.outcome;
  return `<article class="voyage done" data-testid="voyage-${v.id}">
    ${head}
    <ul class="outcome">${o.log.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
    ${Object.keys(o.lost).length ? `<p class="muted">Plundered: ${esc(cargoText(S, o.lost))}</p>` : ""}
    <div class="actions" style="align-items:center;justify-content:space-between">
      <span class="payout" data-testid="voyage-payout-${v.id}">+${fmt(o.revenue + o.bounty)} gold</span>
      <button class="btn btn-primary" data-action="collect" data-id="${v.id}" data-testid="collect-voyage-${v.id}">Collect</button>
    </div>
  </article>`;
}

function shipCard(S, s) {
  const r = s.hull / s.stats.maxHull;
  const canSail = r >= S.catalog.rules.minSailHull;
  return `<article class="ship" data-testid="ship-card-${s.id}">
    <div class="ship-head">
      <span class="ship-name" data-testid="ship-name-${s.id}">${esc(s.name)}</span>
      <span>
        <span class="tag ${s.role}">${esc(S.catalog.shipTypes[s.type].name)}</span>
        ${!canSail ? `<span class="tag warn">Needs repair</span>` : ""}
      </span>
    </div>
    <div class="ship-meta">
      <span>&#9875; ${esc(portName(S, s.port))}</span>
      <span>${s.stats.cannons} guns</span>
      <span>${s.stats.speed.toFixed(2)} kn</span>
      <span data-testid="ship-hold-${s.id}">${cargoCount(s)}/${s.stats.hold} hold</span>
    </div>
    ${hullBar(s)}
    <p class="muted" style="margin:.6rem 0 0">${esc(cargoText(S, s.cargo))}</p>
    <div class="actions">
      <button class="btn btn-sea btn-sm" data-action="sail" data-id="${s.id}" ${canSail ? "" : "disabled"} data-testid="sail-ship-${s.id}">Set sail</button>
      ${s.stats.hold ? `<button class="btn btn-sm" data-action="trade" data-id="${s.id}" data-testid="trade-ship-${s.id}">Trade cargo</button>` : ""}
      <button class="btn btn-sm" data-action="repair" data-id="${s.id}" ${s.repairCost ? "" : "disabled"} data-testid="repair-ship-${s.id}">Repair${s.repairCost ? ` (${fmt(s.repairCost)}g)` : ""}</button>
      <button class="btn btn-sm" data-action="upgrade" data-id="${s.id}" data-testid="upgrade-ship-${s.id}">Upgrade</button>
    </div>
  </article>`;
}

export function fleetView(S) {
  const { voyages, ships } = S.state;
  const docked = ships.filter((s) => s.status === "docked");
  const completed = voyages.filter((v) => v.status === "completed");
  return `
    <div class="section-title"><h3>At sea</h3>
      ${completed.length > 1 ? `<button class="btn btn-primary btn-sm" data-action="collectAll" data-testid="collect-all-button">Collect all (${completed.length})</button>` : ""}
    </div>
    <div class="list" data-testid="voyage-list">${voyages.length ? voyages.map((v) => voyageCard(S, v)).join("") : `<p class="empty">No ships at sea. Fill a hold with rum and set sail.</p>`}</div>
    <div class="section-title"><h3>In port</h3><span class="muted">${docked.length} of ${ships.length} ships</span></div>
    <div class="list" data-testid="docked-ship-list">${docked.length ? docked.map((s) => shipCard(S, s)).join("") : `<p class="empty">Every ship is at sea.</p>`}</div>`;
}

// ---------- Market ----------
export function marketView(S) {
  const { ports, goods } = S.catalog;
  const port = ports[S.marketPort];
  const docked = S.state.ships.filter((s) => s.status === "docked" && s.port === S.marketPort && s.stats.hold > 0);
  const ship = docked.find((s) => s.id === S.marketShip) || docked[0];
  S.marketShip = ship?.id ?? null;
  const rows = Object.entries(goods).map(([g, info]) => {
    const price = port.prices[g];
    const sells = port.produces.includes(g);
    const best = Object.entries(ports).reduce((a, [id, p]) => (p.prices[g] > a.price ? { id, price: p.prices[g] } : a), { price: 0 });
    const held = ship?.cargo[g] || 0;
    return `<tr data-testid="market-row-${g}">
      <td><strong>${info.name}</strong>${sells ? `<br><small>made here</small>` : ""}</td>
      <td class="price ${sells ? "cheap" : ""}" data-testid="market-price-${g}">${price}g</td>
      <td class="hide-sm"><small>${esc(best.id === S.marketPort ? "here" : ports[best.id].name)} ${best.price}g</small></td>
      <td>${held}</td>
      <td><input type="number" min="1" value="${sells ? 5 : held || 1}" data-qty="${g}" data-testid="market-qty-${g}" ${ship ? "" : "disabled"}></td>
      <td style="white-space:nowrap">
        <button class="btn btn-primary btn-sm" data-action="buy" data-good="${g}" ${ship && sells ? "" : "disabled"} data-testid="market-buy-${g}">Buy</button>
        <button class="btn btn-sm" data-action="sell" data-good="${g}" ${held ? "" : "disabled"} data-testid="market-sell-${g}">Sell</button>
      </td>
    </tr>`;
  }).join("");
  return `
    <div class="field-row">
      <label>Port
        <select id="market-port" data-testid="market-port-select">${Object.entries(ports).map(([id, p]) => `<option value="${id}" ${id === S.marketPort ? "selected" : ""}>${p.name}</option>`).join("")}</select>
      </label>
      <label>Loading ship
        <select id="market-ship" data-testid="market-ship-select" ${docked.length ? "" : "disabled"}>${docked.length ? docked.map((s) => `<option value="${s.id}" ${s.id === S.marketShip ? "selected" : ""}>${esc(s.name)} (${cargoCount(s)}/${s.stats.hold})</option>`).join("") : `<option>No cargo ship docked here</option>`}</select>
      </label>
    </div>
    ${ship ? `<p class="muted" data-testid="market-hold-info">${esc(ship.name)}: ${cargoCount(ship)} of ${ship.stats.hold} crates &middot; ${esc(cargoText(S, ship.cargo))}</p>` : `<p class="empty">Dock a cargo ship in ${esc(port.name)} to trade here. Prices are still shown for planning.</p>`}
    <table data-testid="market-table">
      <thead><tr><th>Good</th><th>Price</th><th class="hide-sm">Best sale</th><th>Hold</th><th>Qty</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="muted" style="margin-top:1rem">Goods can only be bought where they are made. Cargo is sold automatically at the port where a voyage ends.</p>`;
}

// ---------- Shipyard ----------
export function yardPorts(S) {
  const set = new Set([S.catalog.rules.homePort]);
  S.state.ships.forEach((s) => s.status === "docked" && set.add(s.port));
  return [...set];
}

export function shipyardView(S) {
  const { shipTypes, ports, rules } = S.catalog;
  const allowed = yardPorts(S);
  if (!allowed.includes(S.yardPort)) S.yardPort = allowed[0];
  const full = S.state.ships.length >= rules.maxFleet;
  const cards = Object.entries(shipTypes).map(([id, t]) => `
    <div class="yard-card" data-testid="yard-card-${id}">
      <div class="ship-head"><strong class="ship-name">${t.name}</strong><span class="tag ${t.role}">${t.role}</span></div>
      <p>${t.blurb}</p>
      <div class="stat-grid"><span>Hull ${t.hull}</span><span>Guns ${t.cannons}</span><span>Hold ${t.hold}</span><span>Speed ${t.speed}</span></div>
      <span class="cost">${fmt(t.cost)} gold</span>
      <button class="btn btn-primary btn-sm" data-action="buyShip" data-type="${id}" ${full || S.state.gold < t.cost ? "disabled" : ""} data-testid="buy-ship-${id}">${full ? "Fleet full" : S.state.gold < t.cost ? `Need ${fmt(t.cost - S.state.gold)} more` : "Commission"}</button>
    </div>`).join("");
  return `
    <div class="field-row">
      <label>Shipyard
        <select id="yard-port" data-testid="yard-port-select">${allowed.map((id) => `<option value="${id}" ${id === S.yardPort ? "selected" : ""}>${ports[id].name}</option>`).join("")}</select>
      </label>
      <label>New ship's name
        <input id="yard-name" maxlength="24" placeholder="e.g. Queen's Revenge" data-testid="yard-name-input">
      </label>
    </div>
    <p class="muted">Fleet ${S.state.ships.length} / ${rules.maxFleet}. Escorts carry little or no cargo but sail alongside your traders and fight off pirates.</p>
    <div class="yard">${cards}</div>`;
}

// ---------- Logbook ----------
export function logView(S) {
  const st = S.state.stats;
  const entries = S.state.history.map((h) => `
    <div class="log-entry" data-testid="log-entry-${h.id}">
      <header>
        <strong>${esc(h.ship)}: ${esc(portName(S, h.from))} &rarr; ${esc(portName(S, h.to))}${h.escorts ? ` <small>(+${h.escorts} escort)</small>` : ""}</strong>
        <span class="price ${h.profit >= 0 ? "cheap" : "dear"}">${h.profit >= 0 ? "+" : ""}${fmt(h.profit)}g profit</span>
      </header>
      <ul class="outcome">${h.log.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
      <small>${new Date(h.at).toLocaleString()}</small>
    </div>`).join("");
  return `
    <div class="stats-row" data-testid="log-stats">
      <div><span>Voyages</span><strong>${st.voyages}</strong></div>
      <div><span>Gold earned</span><strong>${fmt(st.earned)}</strong></div>
      <div><span>Battles won</span><strong>${st.battlesWon}</strong></div>
      <div><span>Battles lost</span><strong>${st.battlesLost}</strong></div>
    </div>
    ${entries || `<p class="empty">The logbook is blank. Your first voyage awaits.</p>`}`;
}

// ---------- Dialogs ----------
export function dispatchDialog(S, ship) {
  const { routes, ports } = S.catalog;
  const dests = Object.values(routes)
    .filter((r) => r.a === ship.port || r.b === ship.port)
    .map((r) => ({ id: r.a === ship.port ? r.b : r.a, route: r }));
  const escorts = S.state.ships.filter((s) => s.id !== ship.id && s.status === "docked" && s.port === ship.port && s.hull / s.stats.maxHull >= S.catalog.rules.minSailHull);
  return `<form class="dialog-inner" id="dispatch-form" data-ship="${ship.id}" data-testid="dispatch-form">
    <h3>Set sail: ${esc(ship.name)}</h3>
    <p class="muted" style="margin:0">From ${esc(ports[ship.port].name)} carrying ${esc(cargoText(S, ship.cargo))}.</p>
    <strong>Destination</strong>
    <div class="choice-list">${dests.map(({ id, route }, i) => `
      <label class="choice" data-testid="dest-option-${id}"><input type="radio" name="to" value="${id}" ${i === 0 ? "checked" : ""}>
        <span class="grow">${ports[id].name}</span>
        <small>${duration(route.duration * 1000)} base &middot; pirates ${pct(S.state.routeRisk[routeKey(ship.port, id)] ?? route.risk)}</small>
      </label>`).join("")}</div>
    <strong>Escorts</strong>
    <div class="choice-list">${escorts.length ? escorts.map((e) => `
      <label class="choice" data-testid="escort-option-${e.id}"><input type="checkbox" name="escort" value="${e.id}">
        <span class="grow">${esc(e.name)} <small>${esc(S.catalog.shipTypes[e.type].name)}</small></span>
        <small>${e.stats.cannons} guns</small>
      </label>`).join("") : `<p class="empty" style="padding:0">No other seaworthy ships in this port. Buy a Privateer Cutter in the shipyard to escort your traders.</p>`}</div>
    <div class="estimate" id="dispatch-estimate" data-testid="dispatch-estimate"></div>
    <p class="form-error" id="dispatch-error" data-testid="dispatch-error"></p>
    <div class="dialog-actions">
      <button type="button" class="btn btn-ghost" data-close data-testid="dispatch-cancel-button">Stay in port</button>
      <button type="submit" class="btn btn-sea" data-testid="dispatch-confirm-button">Weigh anchor</button>
    </div>
  </form>`;
}

export function dispatchEstimate(S, ship, to, escortIds) {
  const route = S.catalog.routes[routeKey(ship.port, to)];
  const fleet = [ship, ...escortIds.map((id) => shipById(S, id))];
  const speed = Math.min(...fleet.map((s) => s.stats.speed));
  const escortGuns = fleet.slice(1).reduce((a, s) => a + s.stats.cannons, 0);
  const guns = fleet.reduce((a, s) => a + s.stats.cannons, 0);
  const risk = S.state.routeRisk[routeKey(ship.port, to)] ?? route.risk;
  const prices = S.catalog.ports[to].prices;
  const value = fleet.reduce((a, s) => a + Object.entries(s.cargo).reduce((b, [g, q]) => b + q * prices[g], 0), 0);
  return `Voyage time: ${duration((route.duration / speed) * 1000)}<br>
    Chance of pirate attack: ${pct(attackChance(risk, escortGuns))} &middot; Fleet guns: ${guns}<br>
    Cargo value at ${esc(S.catalog.ports[to].name)}: ${fmt(value)} gold`;
}

export function upgradeDialog(S, ship) {
  const { upgrades, rules } = S.catalog;
  return `<div class="dialog-inner" data-testid="upgrade-dialog">
    <h3>Refit: ${esc(ship.name)}</h3>
    <p class="muted" style="margin:0">Treasury: ${fmt(S.state.gold)} gold</p>
    <div class="choice-list" style="max-height:none">${Object.entries(upgrades).map(([k, u]) => {
      const lvl = ship.upgrades[k];
      const maxed = lvl >= rules.maxUpgrade;
      const cost = ship.upgradeCosts[k];
      return `<div class="choice" data-testid="upgrade-row-${k}">
        <span class="grow"><strong>${u.name}</strong> <small>Lv ${lvl}/${rules.maxUpgrade}</small><br><small>${u.effect}</small></span>
        <button class="btn btn-primary btn-sm" data-action="doUpgrade" data-id="${ship.id}" data-kind="${k}" ${maxed || S.state.gold < cost || ship.status !== "docked" ? "disabled" : ""} data-testid="upgrade-buy-${k}">${maxed ? "Max" : `${fmt(cost)}g`}</button>
      </div>`;
    }).join("")}</div>
    <div class="dialog-actions"><button class="btn btn-ghost" data-close data-testid="upgrade-close-button">Done</button></div>
  </div>`;
}
