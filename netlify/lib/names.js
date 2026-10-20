// Name validation shared by captain and ship names.
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "!": "i", "|": "i" };

// Banned anywhere inside the name (spaces/punctuation removed first).
const BANNED_ANYWHERE = [
  "fuck", "fuk", "shit", "cunt", "bitch", "nigg", "niga", "faggot", "slut", "whore", "pussy", "rapist",
  "nazi", "hitler", "asshole", "bastard", "wank", "twat", "retard", "kike", "penis", "vagina", "porn",
  "molest", "paedo", "incest", "jizz", "dildo", "boob", "tranny", "wetback", "killyourself", "motherf",
  "bollock", "kkk", "heilh", "siegheil", "terroris", "genocid", "clit", "anal", "orgasm", "semen", "spunk"
];
// Banned only as a whole word (avoids blocking Hancock, Moby Dick, Grapes, Torpedo...).
const BANNED_WORDS = [
  "ass", "arse", "cock", "dick", "cum", "sex", "tit", "tits", "fag", "hoe", "rape", "coon", "gook", "dyke",
  "pedo", "isis", "spic", "spick", "chink", "kys", "nonce", "prick", "piss", "crap", "damn", "negro"
];
const RESERVED = [
  "admin", "administrator", "moderator", "mod", "system", "root", "support", "staff", "official",
  "netlify", "server", "null", "undefined", "anonymous", "everyone", "gamemaster", "gm"
];

const normalize = (s) =>
  s.toLowerCase().split("").map((c) => LEET[c] ?? c).join("");

export function isOffensive(name) {
  const n = normalize(name);
  const squashed = n.replace(/[^a-z]/g, "");
  if (BANNED_ANYWHERE.some((w) => squashed.includes(w))) return true;
  const words = n.split(/[^a-z]+/).filter(Boolean);
  return words.some((w) => BANNED_WORDS.includes(w));
}

export function validateName(raw, { min, max, label }) {
  if (typeof raw !== "string") return `${label} is required.`;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < min || name.length > max) return `${label} must be ${min}-${max} characters.`;
  if (!/^[A-Za-z][A-Za-z0-9 '\-]*$/.test(name))
    return `${label} must start with a letter and use only letters, numbers, spaces, apostrophes or hyphens.`;
  if (/(.)\1{3,}/.test(name)) return `${label} cannot repeat the same character 4+ times.`;
  if (isOffensive(name)) return `That ${label.toLowerCase()} is not allowed on these seas. Choose a respectable name.`;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (RESERVED.includes(id)) return `That ${label.toLowerCase()} is reserved.`;
  return null;
}

export const cleanName = (raw) => raw.trim().replace(/\s+/g, " ");

// Stable key for a captain name: "Anne Bonny" -> "anne-bonny"
export const captainId = (raw) =>
  cleanName(raw).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
