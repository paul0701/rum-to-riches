export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

export function requireMethod(req, method) {
  if (req.method !== method) throw new HttpError(405, `Method ${req.method} not allowed. Use ${method}.`);
}

export async function readJson(req) {
  const text = await req.text();
  if (text.length > 10_000) throw new HttpError(413, "Request body too large.");
  let body;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HttpError(400, "Request body must be a JSON object.");
  return body;
}

// Wraps a handler so every thrown error becomes a JSON error response.
export const handle = (fn) => async (req, context) => {
  try {
    return await fn(req, context);
  } catch (err) {
    if (err && Number.isInteger(err.status)) return json(err.status, { ok: false, error: err.message });
    console.error(err);
    return json(500, { ok: false, error: "Something went wrong below decks. Please try again." });
  }
};
