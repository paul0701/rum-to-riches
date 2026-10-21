// PIN rules, shared by the browser (live hints on the enlist form) and the server (the real check).
// Pure functions, no imports, so both sides can load this one file.
export const PIN_MIN = 4;
export const PIN_MAX = 6;
export const MAX_SAME_DIGIT = 3;

export const PIN_RULES = [
  { id: "length", text: `${PIN_MIN} to ${PIN_MAX} digits, numbers only`, ok: (p) => new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(p) },
  { id: "pairs", text: "No digit twice in a row (so no 11 or 5 5)", ok: (p) => !/(\d)\1/.test(p) },
  {
    // With back-to-back repeats banned and a 6 digit maximum, no digit can reach 4 uses, so this can never fail today.
    // It stays as a guard in case the PIN is ever allowed to be longer, and is hidden from the form until then.
    id: "repeats",
    hidden: true,
    text: `No digit more than ${MAX_SAME_DIGIT} times in the whole PIN`,
    ok: (p) => {
      const counts = {};
      for (const d of p.replace(/\D/g, "")) counts[d] = (counts[d] || 0) + 1;
      return Object.values(counts).every((n) => n <= MAX_SAME_DIGIT);
    }
  }
];

// Returns null when the PIN is acceptable for a NEW PIN, otherwise a message for the player.
export function pinProblem(pin) {
  if (typeof pin !== "string" || !PIN_RULES[0].ok(pin)) return `PIN must be ${PIN_MIN} to ${PIN_MAX} digits.`;
  if (!PIN_RULES[1].ok(pin)) return "That PIN has the same digit twice in a row (like 11). Pick a PIN without back-to-back repeats.";
  if (!PIN_RULES[2].ok(pin)) return `That PIN uses one digit more than ${MAX_SAME_DIGIT} times. Mix it up a little.`;
  return null;
}
