import { scryptSync, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { HttpError } from "./http.js";
import { updateRecord } from "./store.js";

export const MAX_FAILED = 5;
export const LOCK_MS = 15 * 60 * 1000;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 5;

export const PIN_RE = /^\d{4,6}$/;
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const scrypt = (secret, salt) => scryptSync(secret, salt, 32).toString("hex");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const safeEqual = (a, b) => {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

export function makeSecret(value) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scrypt(value, salt) };
}

export const verifySecret = (value, secret) => !!secret && safeEqual(scrypt(value, secret.salt), secret.hash);

export function maskEmail(email) {
  const [user, domain] = email.split("@");
  return `${user[0]}${"*".repeat(Math.max(2, user.length - 1))}@${domain}`;
}

export function assertNotLocked(auth, now) {
  if (auth.lockUntil && auth.lockUntil > now) {
    const mins = Math.ceil((auth.lockUntil - now) / 60000);
    throw new HttpError(429, `Too many failed attempts. This captain is locked for ${mins} more minute(s).`);
  }
}

export function registerFailure(auth, now) {
  auth.failed = (auth.failed || 0) + 1;
  if (auth.failed >= MAX_FAILED) {
    auth.lockUntil = now + LOCK_MS;
    auth.failed = 0;
  }
}

// Issues a session token "<playerId>.<secret>"; only the SHA-256 of the secret is stored.
export function issueSession(record, now) {
  const secret = randomBytes(32).toString("hex");
  const sessions = (record.auth.sessions || []).filter((s) => s.exp > now);
  sessions.push({ h: sha256(secret), exp: now + SESSION_MS });
  record.auth.sessions = sessions.slice(-MAX_SESSIONS);
  record.auth.failed = 0;
  record.auth.lockUntil = 0;
  return `${record.id}.${secret}`;
}

export function parseToken(req) {
  const header = req.headers.get("authorization") || "";
  const m = header.match(/^Bearer ([a-z0-9-]{1,40})\.([a-f0-9]{64})$/);
  if (!m) throw new HttpError(401, "Not signed in. Please sign in with your captain name and PIN.");
  return { playerId: m[1], secret: m[2] };
}

export function verifySession(record, secret, now) {
  const h = sha256(secret);
  if (!record || !(record.auth.sessions || []).some((s) => s.h === h && s.exp > now))
    throw new HttpError(401, "Your session has expired. Please sign in again.");
}

// Runs mutate(record, now) on the signed-in captain's save under optimistic locking.
export function withPlayer(req, mutate) {
  const { playerId, secret } = parseToken(req);
  return updateRecord(playerId, (record) => {
    const now = Date.now();
    verifySession(record, secret, now);
    return mutate(record, now);
  });
}

export function revokeSession(record, secret) {
  const h = sha256(secret);
  record.auth.sessions = (record.auth.sessions || []).filter((s) => s.h !== h);
}
