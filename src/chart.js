// Hand-inked SVG chart of the Caribbean with live ship positions.
const LAND = [
  "M4 17 Q12 12 22 16 Q32 19 40 24 Q47 27 52 30 Q46 31 38 28 Q28 25 18 22 Q10 21 4 20 Z",
  "M55 34 Q60 30 67 31 Q74 32 77 35 Q73 39 65 38 Q59 38 55 36 Z",
  "M36 45 Q40 42 45 43 Q47 45 44 46.5 Q39 47 36 45 Z",
  "M0 82 L0 78 Q12 74 24 77 Q36 80 44 77 Q52 74 60 77 Q72 80 84 74 Q93 70 100 72 L100 82 Z",
  "M89 58 Q91 57 92 59 Q91 61 89 60 Z",
  "M80 40 Q82 39 82.5 41 Q81 42 80 41 Z",
  "M84 47 Q85.5 46 86 48 Q84.5 49 84 47 Z"
];
const ISLETS = [[44, 7, 1.2, 0.6], [49, 9, 1.6, 0.7], [41, 11, 0.9, 0.5], [53, 13, 1.1, 0.5], [62, 30.5, 1.4, 0.5]];

const riskColor = (risk) => {
  const t = Math.min(1, Math.max(0, (risk - 0.05) / 0.5));
  const mix = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${mix(44, 154)},${mix(90, 59)},${mix(94, 32)})`;
};

export function renderChart(S, svg) {
  const { ports, routes } = S.catalog;
  const docked = {};
  S.state.ships.forEach((s) => s.status === "docked" && (docked[s.port] = (docked[s.port] || 0) + 1));
  const grid = [...Array(9)].map((_, i) => `<line x1="${i * 12.5}" y1="0" x2="${i * 12.5}" y2="82"/>`).join("") +
    [...Array(7)].map((_, i) => `<line x1="0" y1="${i * 13.6}" x2="100" y2="${i * 13.6}"/>`).join("");
  const lines = Object.entries(routes).map(([k, r]) => {
    const a = ports[r.a];
    const b = ports[r.b];
    const risk = S.state.routeRisk[k] ?? r.risk;
    return `<line class="route" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${riskColor(risk)}"><title>${a.name} – ${b.name}: pirate risk ${Math.round(risk * 100)}%</title></line>`;
  }).join("");
  const dots = Object.entries(ports).map(([id, p]) => `
    <g class="port ${id === S.marketPort ? "selected" : ""}" data-port="${id}" data-testid="chart-port-${id}">
      <circle cx="${p.x}" cy="${p.y}" r="1.4"/>
      <text x="${p.x > 80 ? p.x - 2 : p.x + 2}" y="${p.y - 1.2}" text-anchor="${p.x > 80 ? "end" : "start"}">${p.name}</text>
      ${docked[id] ? `<text class="count" x="${p.x > 80 ? p.x - 2 : p.x + 2}" y="${p.y + 2.4}" text-anchor="${p.x > 80 ? "end" : "start"}">${docked[id]} docked</text>` : ""}
    </g>`).join("");
  const markers = S.state.voyages.filter((v) => v.status === "sailing").map((v) =>
    `<g class="ship-marker" data-voyage="${v.id}"><path d="M-1.1 0.6 L1.1 0.6 L0.6 1.3 L-0.6 1.3 Z M0 -1.6 L0 0.5 M0 -1.5 L1 0.3 L0 0.3" /></g>`).join("");
  svg.innerHTML = `
    <g class="grid">${grid}</g>
    ${LAND.map((d) => `<path class="land" d="${d}"/>`).join("")}
    ${ISLETS.map(([x, y, rx, ry]) => `<ellipse class="land" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`).join("")}
    <g class="compass" transform="translate(88 14)">
      <circle r="5"/><circle r="3.6"/><path d="M0 -6.5 L1 0 L0 6.5 L-1 0 Z M-6.5 0 L0 1 L6.5 0 L0 -1 Z" fill="rgba(106,82,54,.25)"/>
      <text x="-0.7" y="-7.2">N</text>
    </g>
    <text class="cartouche" x="4" y="70">Mare Caribbeum</text>
    ${lines}${dots}${markers}`;
  tickChart(S, svg);
}

export function tickChart(S, svg) {
  const now = S.now();
  const { ports } = S.catalog;
  svg.querySelectorAll(".ship-marker").forEach((g) => {
    const v = S.state.voyages.find((x) => x.id === g.dataset.voyage);
    if (!v) return;
    const t = Math.min(1, Math.max(0, (now - v.departAt) / (v.arriveAt - v.departAt)));
    const a = ports[v.from];
    const b = ports[v.to];
    g.setAttribute("transform", `translate(${a.x + (b.x - a.x) * t} ${a.y + (b.y - a.y) * t})`);
  });
}
