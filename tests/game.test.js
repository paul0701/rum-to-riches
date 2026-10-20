import test from "node:test";
import assert from "node:assert/strict";
import { newGameState, applyAction, resolveDue, collectVoyage, attackChance, GameError } from "../netlify/lib/game.js";
import { validateName } from "../netlify/lib/names.js";

const rngOf = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test("new game starts with one sloop and 500 gold", () => {
  const s = newGameState(0);
  assert.equal(s.ships.length, 1);
  assert.equal(s.gold, 500);
  assert.equal(s.ships[0].port, "port-royal");
});

test("buy cargo, dispatch with escort, resolve and collect", () => {
  const s = newGameState(0);
  s.gold = 10000;
  const lead = s.ships[0];
  applyAction(s, { action: "buyShip", type: "cutter", name: "Sea Wolf", port: "port-royal" }, 0);
  const escort = s.ships[1];
  applyAction(s, { action: "buyCargo", shipId: lead.id, good: "rum", qty: 20 }, 0);
  assert.equal(lead.cargo.rum, 20);
  applyAction(s, { action: "dispatch", shipId: lead.id, escortIds: [escort.id], to: "cartagena" }, 1000);
  assert.equal(lead.status, "sailing");
  assert.equal(escort.status, "sailing");
  assert.equal(resolveDue(s, 2000), 0, "not arrived yet");
  const v = s.voyages[0];
  // no storm (0.9), no attack (0.99)
  assert.equal(resolveDue(s, v.arriveAt, rngOf(0.9, 0.99)), 1);
  assert.equal(v.status, "completed");
  assert.equal(v.outcome.revenue, 20 * 27);
  const before = s.gold;
  collectVoyage(s, v.id, v.arriveAt);
  assert.equal(s.gold, before + 540);
  assert.equal(lead.port, "cartagena");
  assert.equal(lead.status, "docked");
  assert.equal(s.history.length, 1);
});

test("escorts lower attack chance", () => {
  assert.ok(attackChance(0.35, 20) < attackChance(0.35, 0));
});

test("rejects invalid actions", () => {
  const s = newGameState(0);
  assert.throws(() => applyAction(s, { action: "hack" }, 0), GameError);
  assert.throws(() => applyAction(s, { action: "buyCargo", shipId: s.ships[0].id, good: "rum", qty: 1e6 }, 0), GameError);
  assert.throws(() => applyAction(s, { action: "buyCargo", shipId: s.ships[0].id, good: "spices", qty: 1 }, 0), GameError);
  assert.throws(() => applyAction(s, { action: "dispatch", shipId: s.ships[0].id, to: "port-royal" }, 0), GameError);
});

test("name filter blocks profanity but allows pirate names", () => {
  assert.ok(validateName("Sh1t Beard", { min: 3, max: 20, label: "Captain name" }));
  assert.ok(validateName("admin", { min: 3, max: 20, label: "Captain name" }));
  assert.equal(validateName("Jack Hancock", { min: 3, max: 20, label: "Captain name" }), null);
  assert.equal(validateName("Anne Bonny", { min: 3, max: 20, label: "Captain name" }), null);
});
