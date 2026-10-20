import { randomUUID } from "node:crypto";
import { validateName, cleanName } from "./names.js";

export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (msg, status = 400) => {
  throw new GameError(msg, status);
};

export const STATE_VERSION = 1;
export const START_GOLD = 500;
export const MAX_FLEET = 12;
export const MAX_UPGRADE = 3;
export const REPAIR_COST_PER_HULL = 1.5;
export const MIN_SAIL_HULL = 0.4;
export const STORM_CHANCE = 0.12;
const HISTORY_LIMIT = 25;

export const GOODS = {
  rum: { name: "Rum" },
  sugar: { name: "Sugar" },
  tobacco: { name: "Tobacco" },
  spices: { name: "Spices" },
  cotton: { name: "Cotton" }
};

export const PORTS = {
  "havana": { name: "Havana", x: 20, y: 20, produces: ["sugar", "tobacco"], prices: { rum: 16, sugar: 8, tobacco: 14, spices: 42, cotton: 22 } },
  "nassau": { name: "Nassau", x: 46, y: 10, produces: ["cotton"], prices: { rum: 20, sugar: 16, tobacco: 26, spices: 45, cotton: 11 } },
  "tortuga": { name: "Tortuga", x: 64, y: 32, produces: ["tobacco"], prices: { rum: 23, sugar: 15, tobacco: 15, spices: 38, cotton: 20 } },
  "port-royal": { name: "Port Royal", x: 42, y: 44, produces: ["rum", "sugar"], prices: { rum: 12, sugar: 9, tobacco: 22, spices: 40, cotton: 18 } },
  "cartagena": { name: "Cartagena", x: 48, y: 72, produces: ["spices"], prices: { rum: 27, sugar: 18, tobacco: 28, spices: 26, cotton: 24 } },
  "bridgetown": { name: "Bridgetown", x: 90, y: 60, produces: ["rum", "cotton"], prices: { rum: 10, sugar: 13, tobacco: 30, spices: 52, cotton: 13 } }
};
export const HOME_PORT = "port-royal";

export const SHIP_TYPES = {
  sloop: { name: "Sloop", role: "cargo", cost: 800, hold: 20, hull: 100, cannons: 2, speed: 1.0, blurb: "Nimble little trader. Every fortune starts here." },
  schooner: { name: "Schooner", role: "cargo", cost: 2000, hold: 40, hull: 140, cannons: 4, speed: 1.15, blurb: "Fast fore-and-aft rig with a respectable hold." },
  brigantine: { name: "Brigantine", role: "cargo", cost: 5000, hold: 75, hull: 200, cannons: 8, speed: 0.95, blurb: "Workhorse of the Main. Holds plenty, bites back." },
  galleon: { name: "Galleon", role: "cargo", cost: 12000, hold: 140, hull: 320, cannons: 14, speed: 0.8, blurb: "A floating treasury. Slow, and every pirate knows it." },
  cutter: { name: "Privateer Cutter", role: "escort", cost: 1800, hold: 0, hull: 120, cannons: 10, speed: 1.25, blurb: "Escort. Swift guns-for-hire that scare off small raiders." },
  frigate: { name: "Frigate", role: "escort", cost: 6500, hold: 10, hull: 260, cannons: 22, speed: 1.1, blurb: "Escort. A true man-o'-war. Pirates think twice." }
};

export const UPGRADES = {
  hull: { name: "Oak Planking", effect: "+20% max hull per level" },
  cannons: { name: "Gun Deck", effect: "+2 cannons per level (+3 on escorts)" },
  sails: { name: "Canvas & Rigging", effect: "+10% speed per level" },
  hold: { name: "Expanded Hold", effect: "+25% cargo space per level" }
};

const ROUTE_LIST = [
  ["port-royal", "tortuga", 120, 0.25],
  ["port-royal", "havana", 150, 0.15],
  ["port-royal", "cartagena", 210, 0.35],
  ["port-royal", "nassau", 240, 0.2],
  ["port-royal", "bridgetown", 300, 0.3],
  ["tortuga", "nassau", 120, 0.3],
  ["tortuga", "havana", 180, 0.2],
  ["tortuga", "bridgetown", 270, 0.35],
  ["nassau", "havana", 150, 0.15],
  ["nassau", "bridgetown", 330, 0.25],
  ["havana", "cartagena", 270, 0.3],
  ["cartagena", "bridgetown", 240, 0.4]
];
export const routeKey = (a, b) => [a, b].sort().join("|");
export const ROUTES = Object.fromEntries(
  ROUTE_LIST.map(([a, b, duration, risk]) => [routeKey(a, b), { a, b, duration, risk }])
);

export const CATALOG = {
  goods: GOODS,
  ports: PORTS,
  shipTypes: SHIP_TYPES,
  upgrades: UPGRADES,
  routes: ROUTES,
  rules: { maxFleet: MAX_FLEET, maxUpgrade: MAX_UPGRADE, repairCostPerHull: REPAIR_COST_PER_HULL, minSailHull: MIN_SAIL_HULL, homePort: HOME_PORT }
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Math.round(v * 1000) / 1000;
const newId = (p) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const isInt = (v) => Number.isInteger(v);

// ---------- ships ----------
export function makeShip(type, name, port) {
  return {
    id: newId("s"),
    type,
    name,
    port,
    status: "docked",
    voyageId: null,
    hull: SHIP_TYPES[type].hull,
    upgrades: { hull: 0, cannons: 0, sails: 0, hold: 0 },
    cargo: {},
    cargoCost: 0
  };
}

export function shipStats(ship) {
  const t = SHIP_TYPES[ship.type];
  const u = ship.upgrades;
  return {
    maxHull: Math.round(t.hull * (1 + 0.2 * u.hull)),
    cannons: t.cannons + (t.role === "escort" ? 3 : 2) * u.cannons,
    speed: round3(t.speed * (1 + 0.1 * u.sails)),
    hold: Math.round(t.hold * (1 + 0.25 * u.hold))
  };
}

export const cargoCount = (ship) => Object.values(ship.cargo).reduce((a, b) => a + b, 0);
export const upgradeCost = (ship, kind) =>
  Math.max(150, Math.round(SHIP_TYPES[ship.type].cost * 0.35 * (ship.upgrades[kind] + 1)));
export const repairCost = (ship) => Math.ceil((shipStats(ship).maxHull - ship.hull) * REPAIR_COST_PER_HULL);
export const attackChance = (risk, escortCannons) =>
  round3(clamp(risk * (1 - Math.min(0.6, escortCannons / 40)), 0.03, 0.9));

export function newGameState(now) {
  return {
    version: STATE_VERSION,
    gold: START_GOLD,
    ships: [makeShip("sloop", "The Salty Gull", HOME_PORT)],
    voyages: [],
    history: [],
    routeRisk: Object.fromEntries(Object.entries(ROUTES).map(([k, r]) => [k, r.risk])),
    stats: { voyages: 0, earned: 0, battlesWon: 0, battlesLost: 0, shipsBought: 0 },
    createdAt: now,
    updatedAt: now
  };
}

const findShip = (state, id) => {
  if (typeof id !== "string") fail("shipId is required.");
  return state.ships.find((s) => s.id === id) || fail("Ship not found in your fleet.", 404);
};
const requireDocked = (ship) => {
  if (ship.status !== "docked") fail(`${ship.name} is not docked in port.`, 409);
};
const spend = (state, amount) => {
  if (state.gold < amount) fail(`Not enough gold. You need ${amount} but have ${state.gold}.`, 402);
  state.gold -= amount;
};
const portName = (id) => PORTS[id]?.name ?? id;

// ---------- actions (POST /api/save) ----------
const ACTIONS = {
  buyCargo(state, { shipId, good, qty }) {
    const ship = findShip(state, shipId);
    requireDocked(ship);
    if (!GOODS[good]) fail("Unknown good.");
    if (!isInt(qty) || qty < 1 || qty > 1000) fail("qty must be a whole number between 1 and 1000.");
    const port = PORTS[ship.port];
    if (!port.produces.includes(good)) fail(`${port.name} does not sell ${GOODS[good].name}.`);
    const free = shipStats(ship).hold - cargoCount(ship);
    if (qty > free) fail(`${ship.name} only has room for ${free} more crates.`);
    const cost = qty * port.prices[good];
    spend(state, cost);
    ship.cargo[good] = (ship.cargo[good] || 0) + qty;
    ship.cargoCost += cost;
    return `Loaded ${qty} ${GOODS[good].name} onto ${ship.name} for ${cost} gold.`;
  },

  sellCargo(state, { shipId, good, qty }) {
    const ship = findShip(state, shipId);
    requireDocked(ship);
    if (!GOODS[good]) fail("Unknown good.");
    const have = ship.cargo[good] || 0;
    if (!isInt(qty) || qty < 1 || qty > have) fail(`qty must be between 1 and ${have}.`);
    const total = cargoCount(ship);
    const revenue = qty * PORTS[ship.port].prices[good];
    ship.cargoCost = Math.round(ship.cargoCost * (1 - qty / total));
    ship.cargo[good] = have - qty;
    if (!ship.cargo[good]) delete ship.cargo[good];
    state.gold += revenue;
    return `Sold ${qty} ${GOODS[good].name} in ${portName(ship.port)} for ${revenue} gold.`;
  },

  buyShip(state, { type, name, port }) {
    if (!SHIP_TYPES[type]) fail("Unknown ship type.");
    if (state.ships.length >= MAX_FLEET) fail(`Your fleet is at the maximum of ${MAX_FLEET} ships.`, 409);
    if (!PORTS[port]) fail("Unknown port.");
    const present = state.ships.some((s) => s.port === port && s.status === "docked");
    if (port !== HOME_PORT && !present)
      fail(`You can only buy ships in ${portName(HOME_PORT)} or a port where one of your ships is docked.`);
    const err = validateName(name, { min: 2, max: 24, label: "Ship name" });
    if (err) fail(err);
    const clean = cleanName(name);
    if (state.ships.some((s) => s.name.toLowerCase() === clean.toLowerCase()))
      fail("You already have a ship with that name.", 409);
    spend(state, SHIP_TYPES[type].cost);
    state.ships.push(makeShip(type, clean, port));
    state.stats.shipsBought += 1;
    return `The ${SHIP_TYPES[type].name} "${clean}" joins your fleet at ${portName(port)}.`;
  },

  repair(state, { shipId }) {
    const ship = findShip(state, shipId);
    requireDocked(ship);
    const max = shipStats(ship).maxHull;
    if (ship.hull >= max) fail(`${ship.name} is already seaworthy.`);
    const affordable = Math.floor(state.gold / REPAIR_COST_PER_HULL);
    const points = Math.min(max - ship.hull, affordable);
    if (points < 1) fail("Not enough gold to repair.", 402);
    const cost = Math.ceil(points * REPAIR_COST_PER_HULL);
    spend(state, cost);
    ship.hull += points;
    return `Shipwrights restored ${points} hull on ${ship.name} for ${cost} gold.`;
  },

  upgrade(state, { shipId, kind }) {
    const ship = findShip(state, shipId);
    requireDocked(ship);
    if (!UPGRADES[kind]) fail("Unknown upgrade.");
    if (ship.upgrades[kind] >= MAX_UPGRADE) fail(`${UPGRADES[kind].name} is already at maximum level.`, 409);
    const before = shipStats(ship).maxHull;
    spend(state, upgradeCost(ship, kind));
    ship.upgrades[kind] += 1;
    if (kind === "hull") ship.hull += shipStats(ship).maxHull - before;
    return `${ship.name}: ${UPGRADES[kind].name} raised to level ${ship.upgrades[kind]}.`;
  },

  dispatch(state, { shipId, escortIds = [], to }, now) {
    const ship = findShip(state, shipId);
    requireDocked(ship);
    if (!Array.isArray(escortIds) || escortIds.length > 4) fail("escortIds must be a list of up to 4 ships.");
    if (new Set(escortIds).size !== escortIds.length || escortIds.includes(shipId)) fail("Each escort must be a different ship.");
    if (!PORTS[to]) fail("Unknown destination.");
    const route = ROUTES[routeKey(ship.port, to)];
    if (!route) fail(`There is no charted route from ${portName(ship.port)} to ${portName(to)}.`);
    const escorts = escortIds.map((id) => findShip(state, id));
    const fleet = [ship, ...escorts];
    for (const s of fleet) {
      requireDocked(s);
      if (s.port !== ship.port) fail(`${s.name} is not in ${portName(ship.port)}.`);
      if (s.hull < shipStats(s).maxHull * MIN_SAIL_HULL) fail(`${s.name} is too damaged to sail. Repair her first.`, 409);
    }
    const speed = Math.min(...fleet.map((s) => shipStats(s).speed));
    const durationMs = Math.round((route.duration / speed) * 1000);
    const voyage = {
      id: newId("v"),
      leadId: ship.id,
      escortIds: [...escortIds],
      shipIds: fleet.map((s) => s.id),
      from: ship.port,
      to,
      departAt: now,
      arriveAt: now + durationMs,
      cargoCost: fleet.reduce((a, s) => a + s.cargoCost, 0),
      cargo: fleet.reduce((acc, s) => {
        for (const [g, q] of Object.entries(s.cargo)) acc[g] = (acc[g] || 0) + q;
        return acc;
      }, {}),
      status: "sailing",
      outcome: null
    };
    for (const s of fleet) {
      s.status = "sailing";
      s.voyageId = voyage.id;
    }
    state.voyages.push(voyage);
    const esc = escorts.length ? ` escorted by ${escorts.map((e) => e.name).join(", ")}` : "";
    return `${ship.name} set sail for ${portName(to)}${esc}.`;
  }
};

export const SAVE_ACTIONS = Object.keys(ACTIONS);

export function applyAction(state, body, now) {
  const { action } = body;
  if (typeof action !== "string" || !ACTIONS[action])
    fail(`action must be one of: ${SAVE_ACTIONS.join(", ")}.`);
  const message = ACTIONS[action](state, body, now);
  state.updatedAt = now;
  return message;
}

// ---------- voyages (POST /api/voyages) ----------
const neighbours = (port) =>
  Object.values(ROUTES).filter((r) => r.a === port || r.b === port).map((r) => (r.a === port ? r.b : r.a));

export function resolveVoyage(state, v, now, rng = Math.random) {
  const ships = v.shipIds.map((id) => state.ships.find((s) => s.id === id)).filter(Boolean);
  const key = routeKey(v.from, v.to);
  const base = ROUTES[key].risk;
  let risk = state.routeRisk[key] ?? base;
  const isEscort = (s) => v.escortIds.includes(s.id);
  const escortCannons = ships.filter(isEscort).reduce((a, s) => a + shipStats(s).cannons, 0);
  const totalCannons = ships.reduce((a, s) => a + shipStats(s).cannons, 0);
  const o = { attacked: false, won: null, storm: false, divertedTo: null, bounty: 0, revenue: 0, sold: {}, lost: {}, damage: {}, log: [] };

  const damage = (s, lo, hi) => {
    const amt = Math.round(shipStats(s).maxHull * (lo + rng() * (hi - lo)));
    const before = s.hull;
    s.hull = Math.max(1, s.hull - amt);
    o.damage[s.id] = (o.damage[s.id] || 0) + (before - s.hull);
  };

  let dest = v.to;
  if (rng() < STORM_CHANCE) {
    o.storm = true;
    ships.forEach((s) => damage(s, 0.05, 0.15));
    o.log.push("A violent squall battered the fleet.");
    const alts = neighbours(v.to).filter((p) => p !== v.from);
    if (alts.length && rng() < 0.5) {
      dest = alts[Math.floor(rng() * alts.length)];
      o.divertedTo = dest;
      o.log.push(`Blown off course! The fleet made landfall at ${portName(dest)} instead of ${portName(v.to)}.`);
    }
  }

  o.attackChance = attackChance(risk, escortCannons);
  if (rng() < o.attackChance) {
    o.attacked = true;
    o.pirateStrength = Math.round((8 + risk * 60) * (0.7 + rng() * 0.6));
    o.fleetStrength = Math.round(totalCannons * (0.8 + rng() * 0.4));
    if (o.fleetStrength >= o.pirateStrength) {
      o.won = true;
      o.bounty = o.pirateStrength * 12;
      ships.forEach((s) => (isEscort(s) ? damage(s, 0.08, 0.18) : damage(s, 0.03, 0.1)));
      risk -= 0.05;
      state.stats.battlesWon += 1;
      o.log.push(`Pirates attacked (strength ${o.pirateStrength}) but your guns (${o.fleetStrength}) drove them off! Bounty: ${o.bounty} gold.`);
    } else {
      o.won = false;
      for (const s of ships) {
        for (const [g, q] of Object.entries(s.cargo)) {
          const lost = Math.round(q * (0.4 + rng() * 0.4));
          if (!lost) continue;
          s.cargo[g] = q - lost;
          if (!s.cargo[g]) delete s.cargo[g];
          o.lost[g] = (o.lost[g] || 0) + lost;
        }
        isEscort(s) ? damage(s, 0.3, 0.5) : damage(s, 0.2, 0.35);
      }
      risk += 0.05;
      state.stats.battlesLost += 1;
      o.log.push(`Pirates (strength ${o.pirateStrength}) overpowered your fleet (${o.fleetStrength}) and plundered the hold.`);
    }
  } else {
    risk += (base - risk) * 0.25 + 0.01;
    if (!o.storm) o.log.push("Fair winds and an empty horizon. A quiet passage.");
  }
  state.routeRisk[key] = round3(clamp(risk, 0.05, 0.6));

  const prices = PORTS[dest].prices;
  for (const s of ships) {
    for (const [g, q] of Object.entries(s.cargo)) {
      o.revenue += q * prices[g];
      o.sold[g] = (o.sold[g] || 0) + q;
    }
    s.cargo = {};
    s.cargoCost = 0;
    s.port = dest;
    s.status = "moored";
  }
  if (o.revenue) o.log.push(`Cargo sold at ${portName(dest)} for ${o.revenue} gold.`);
  v.finalPort = dest;
  v.status = "completed";
  v.resolvedAt = now;
  v.outcome = o;
}

export function resolveDue(state, now, rng) {
  let count = 0;
  for (const v of state.voyages) {
    if (v.status === "sailing" && v.arriveAt <= now) {
      resolveVoyage(state, v, now, rng);
      count += 1;
    }
  }
  if (count) state.updatedAt = now;
  return count;
}

export function collectVoyage(state, voyageId, now) {
  const v = state.voyages.find((x) => x.id === voyageId);
  if (!v) fail("Voyage not found.", 404);
  if (v.status !== "completed") fail("That voyage is still at sea.", 409);
  const payout = v.outcome.revenue + v.outcome.bounty;
  state.gold += payout;
  for (const id of v.shipIds) {
    const s = state.ships.find((x) => x.id === id);
    if (s) {
      s.status = "docked";
      s.voyageId = null;
    }
  }
  state.stats.voyages += 1;
  state.stats.earned += payout;
  const lead = state.ships.find((s) => s.id === v.leadId);
  state.history.unshift({
    id: v.id,
    ship: lead?.name ?? "Unknown",
    escorts: v.escortIds.length,
    from: v.from,
    to: v.finalPort,
    plannedTo: v.to,
    payout,
    profit: payout - v.cargoCost,
    log: v.outcome.log,
    attacked: v.outcome.attacked,
    won: v.outcome.won,
    at: now
  });
  state.history = state.history.slice(0, HISTORY_LIMIT);
  state.voyages = state.voyages.filter((x) => x.id !== voyageId);
  state.updatedAt = now;
  return payout;
}

// Adds derived numbers the UI needs; never stored.
export function viewState(state) {
  return {
    ...state,
    ships: state.ships.map((s) => ({
      ...s,
      stats: shipStats(s),
      role: SHIP_TYPES[s.type].role,
      repairCost: repairCost(s),
      upgradeCosts: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, upgradeCost(s, k)]))
    }))
  };
}
