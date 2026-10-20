// GET /api/load — load the signed-in captain's save and resolve any voyages that finished while away.
import { json, handle, requireMethod } from "../lib/http.js";
import { withPlayer } from "../lib/auth.js";
import { newGameState, resolveDue, viewState, CATALOG } from "../lib/game.js";

export default handle(async (req) => {
  requireMethod(req, "GET");
  const body = await withPlayer(req, (record, now) => {
    let changed = false;
    if (!record.state || typeof record.state !== "object") {
      record.state = newGameState(now);
      changed = true;
    }
    const resolved = resolveDue(record.state, now);
    return {
      changed: changed || resolved > 0,
      result: {
        ok: true,
        captain: record.captain,
        playerId: record.id,
        emailHint: record.auth.emailHint || null,
        resolved,
        serverNow: now,
        state: viewState(record.state),
        catalog: CATALOG
      }
    };
  });
  return json(200, body);
});

export const config = { path: "/api/load" };
