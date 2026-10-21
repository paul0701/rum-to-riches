import test from "node:test";
import assert from "node:assert/strict";
import { pinProblem, PIN_RULES } from "../src/pin.js";
import { suggestNames, nameCandidates, validateName, captainId } from "../netlify/lib/names.js";

test("PIN rules: no digit twice in a row", () => {
  for (const ok of ["1357", "1212", "121212", "123123", "9081"]) assert.equal(pinProblem(ok), null, ok);
  for (const bad of ["1123", "1233", "1111", "551234", "123455"]) assert.match(pinProblem(bad), /twice in a row/, bad);
});

test("PIN rule: max 3 of one digit holds, and the guard works for longer PINs", () => {
  // With no back-to-back repeats, 4 uses of one digit needs 7 digits, which the length rule already refuses.
  assert.match(pinProblem("1213141"), /4 to 6 digits/);
  const repeats = PIN_RULES.find((r) => r.id === "repeats");
  assert.equal(repeats.ok("121314"), true, "three 1s is fine");
  assert.equal(repeats.ok("1213141"), false, "four 1s is not");
});

test("PIN format problems come first", () => {
  assert.match(pinProblem("12"), /4 to 6 digits/);
  assert.match(pinProblem("12ab"), /4 to 6 digits/);
  assert.match(pinProblem(1234), /4 to 6 digits/);
});

test("name candidates are valid, within 20 chars and never the original", () => {
  const opts = { min: 3, max: 20, label: "Captain name" };
  for (const base of ["Jack Hancock", "Captain Paul Jones", "Anne Bonny"]) {
    const c = nameCandidates(base, opts);
    assert.ok(c.length >= 3, `${base} has candidates`);
    for (const n of c) {
      assert.ok(n.length <= 20, `${n} fits`);
      assert.equal(validateName(n, opts), null, `${n} valid`);
      assert.notEqual(captainId(n), captainId(base));
    }
  }
});

test("suggestNames skips taken names and returns at most three free ones", async () => {
  const taken = new Set();
  const all = nameCandidates("Anne Bonny", { min: 3, max: 20, label: "Captain name" });
  taken.add(captainId(all[0]));
  taken.add(captainId(all[1]));
  const found = await suggestNames("Anne Bonny", async (n) => taken.has(captainId(n)));
  assert.equal(found.length, 3);
  for (const n of found) assert.ok(!taken.has(captainId(n)));
});

test("suggestNames returns an empty list when everything is taken", async () => {
  assert.deepEqual(await suggestNames("Anne Bonny", async () => true), []);
});

test("suggestions never chop a name mid-word", () => {
  const opts = { min: 3, max: 20, label: "Captain name" };
  const c = nameCandidates("Anne Bonny", opts);
  assert.ok(!c.some((n) => n.startsWith("Anne Bonn ")), c.join(", "));
  assert.ok(c.includes("Anne Bonny the Red"));
});
