// POST /api/auth  { action: "register" | "login" | "recover" | "logout", ... }
import { json, handle, readJson, requireMethod, HttpError } from "../lib/http.js";
import { loadRecord, createRecord, updateRecord } from "../lib/store.js";
import { validateName, cleanName, captainId } from "../lib/names.js";
import {
  PIN_RE, EMAIL_RE, makeSecret, verifySecret, maskEmail, assertNotLocked,
  registerFailure, issueSession, parseToken, revokeSession
} from "../lib/auth.js";
import { newGameState } from "../lib/game.js";

const TAKEN = "That captain name is already taken. Sign in or choose another.";
const NOT_FOUND = "No captain by that name sails these waters. Enlist first.";

const requirePin = (pin, field = "PIN") => {
  if (typeof pin !== "string" || !PIN_RE.test(pin)) throw new HttpError(400, `${field} must be 4 to 6 digits.`);
};

const requireCaptain = (captain) => {
  if (typeof captain !== "string" || !captain.trim()) throw new HttpError(400, "Captain name is required.");
  const id = captainId(captain);
  if (!id) throw new HttpError(400, "Captain name is invalid.");
  return id;
};

const sessionReply = (record, token) =>
  ({ ok: true, token, playerId: record.id, captain: record.captain, emailHint: record.auth.emailHint || null });

// Records a failed attempt (persisted) and then reports the error.
const failAttempt = (record, now, message) => {
  registerFailure(record.auth, now);
  return { changed: true, result: { error: new HttpError(401, message) } };
};

const unwrap = (result) => {
  if (result.error) throw result.error;
  return json(200, result);
};

async function register({ captain, pin, email }) {
  const err = validateName(captain, { min: 3, max: 20, label: "Captain name" });
  if (err) throw new HttpError(400, err);
  requirePin(pin);
  let emailNorm = null;
  if (email !== undefined && email !== null && email !== "") {
    if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) throw new HttpError(400, "Recovery email is not a valid address.");
    emailNorm = email.trim().toLowerCase();
  }
  const id = captainId(captain);
  if (await loadRecord(id)) throw new HttpError(409, TAKEN);
  const now = Date.now();
  const record = {
    id,
    captain: cleanName(captain),
    auth: {
      pin: makeSecret(pin),
      email: emailNorm ? makeSecret(emailNorm) : null,
      emailHint: emailNorm ? maskEmail(emailNorm) : null,
      sessions: [],
      failed: 0,
      lockUntil: 0
    },
    state: newGameState(now),
    createdAt: new Date(now).toISOString()
  };
  const token = issueSession(record, now);
  if (!(await createRecord(record))) throw new HttpError(409, TAKEN);
  return json(200, sessionReply(record, token));
}

async function login({ captain, pin }) {
  const id = requireCaptain(captain);
  requirePin(pin);
  const result = await updateRecord(id, (record) => {
    if (!record) throw new HttpError(404, NOT_FOUND);
    const now = Date.now();
    assertNotLocked(record.auth, now);
    if (!verifySecret(pin, record.auth.pin)) return failAttempt(record, now, "Wrong PIN.");
    return { changed: true, result: sessionReply(record, issueSession(record, now)) };
  });
  return unwrap(result);
}

async function recover({ captain, email, newPin }) {
  const id = requireCaptain(captain);
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) throw new HttpError(400, "Enter the recovery email you registered with.");
  requirePin(newPin, "New PIN");
  const result = await updateRecord(id, (record) => {
    if (!record) throw new HttpError(404, NOT_FOUND);
    const now = Date.now();
    assertNotLocked(record.auth, now);
    if (!record.auth.email) throw new HttpError(400, "This captain has no recovery email on file, so the PIN cannot be reset.");
    if (!verifySecret(email.trim().toLowerCase(), record.auth.email))
      return failAttempt(record, now, "That email does not match our records.");
    record.auth.pin = makeSecret(newPin);
    record.auth.sessions = [];
    return { changed: true, result: sessionReply(record, issueSession(record, now)) };
  });
  return unwrap(result);
}

async function logout(req) {
  const { playerId, secret } = parseToken(req);
  await updateRecord(playerId, (record) => {
    if (!record) return { changed: false, result: null };
    revokeSession(record, secret);
    return { changed: true, result: null };
  });
  return json(200, { ok: true });
}

export default handle(async (req) => {
  requireMethod(req, "POST");
  const body = await readJson(req);
  switch (body.action) {
    case "register": return register(body);
    case "login": return login(body);
    case "recover": return recover(body);
    case "logout": return logout(req);
    default: throw new HttpError(400, "action must be one of: register, login, recover, logout.");
  }
});

export const config = { path: "/api/auth" };
