// POST /api/voyages — resolve completed voyages (rewards, damage, pirates, storms, route risk) and collect them.
// Body: { action: "resolve" } | { action: "collect", voyageId } | { action: "collectAll" }
import { json, handle, readJson, requireMethod, HttpError } from "../lib/http.js";
import { withPlayer } from "../lib/auth.js";
import { resolveDue, collectVoyage, viewState } from "../lib/game.js";

export default handle(async (req) => {
  requireMethod(req, "POST");
  const body = await readJson(req);
  if (!["resolve", "collect", "collectAll"].includes(body.action))
    throw new HttpError(400, "action must be one of: resolve, collect, collectAll.");
  if (body.action === "collect" && typeof body.voyageId !== "string")
    throw new HttpError(400, "voyageId is required to collect.");

  const reply = await withPlayer(req, (record, now) => {
    const state = record.state;
    const resolved = resolveDue(state, now);
    let collected = 0;
    let payout = 0;
    if (body.action === "collect") {
      payout = collectVoyage(state, body.voyageId, now);
      collected = 1;
    } else if (body.action === "collectAll") {
      for (const v of state.voyages.filter((x) => x.status === "completed")) {
        payout += collectVoyage(state, v.id, now);
        collected += 1;
      }
    }
    const message = collected
      ? `Collected ${collected} voyage(s) for ${payout} gold.`
      : resolved ? `${resolved} voyage(s) made port.` : null;
    return {
      changed: resolved > 0 || collected > 0,
      result: { ok: true, message, resolved, collected, payout, serverNow: now, state: viewState(state) }
    };
  });
  return json(200, reply);
});

export const config = { path: "/api/voyages" };
