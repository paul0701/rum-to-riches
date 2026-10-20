// POST /api/save — apply one validated player action to the server-held state and persist it.
// Body: { action: "buyCargo" | "sellCargo" | "buyShip" | "repair" | "upgrade" | "dispatch", ...params }
import { json, handle, readJson, requireMethod } from "../lib/http.js";
import { withPlayer } from "../lib/auth.js";
import { applyAction, resolveDue, viewState } from "../lib/game.js";

export default handle(async (req) => {
  requireMethod(req, "POST");
  const body = await readJson(req);
  const reply = await withPlayer(req, (record, now) => {
    const resolved = resolveDue(record.state, now);
    const message = applyAction(record.state, body, now);
    return { changed: true, result: { ok: true, message, resolved, serverNow: now, state: viewState(record.state) } };
  });
  return json(200, reply);
});

export const config = { path: "/api/save" };
