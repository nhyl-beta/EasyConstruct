// Offline stand-in for the EstimationPro.ai reference-price API (the app supports this through ESTIMATIONPRO_BASE_URL).
// Synthetic, deterministic prices so the demo seeders can run without the internet or the external quota.
import { createServer, type Server } from "node:http";

const TRADES: Record<string, [string, string, number][]> = {
  Concrete: [["Ready-mix concrete 3000 psi", "m3", 120], ["Concrete hollow blocks 6in", "pc", 0.6], ["Formwork, plywood", "m2", 18]],
  Masonry: [["CHB laying", "m2", 9], ["Plastering", "m2", 6]],
  "Steel & Rebar": [["Deformed rebar 12mm", "kg", 0.95], ["Structural steel, fabricated", "kg", 2.4]],
  Carpentry: [["Framing lumber", "m3", 480], ["Interior door, solid", "pc", 140]],
  Roofing: [["Pre-painted roofing sheet", "m2", 11], ["Roof framing, steel purlins", "m2", 14]],
  Electrical: [["THHN wire 3.5mm2", "m", 0.8], ["Panel board 12 branch", "set", 160]],
  Plumbing: [["PVC pipe 4in", "m", 6], ["Water closet set", "set", 85]],
  Painting: [["Latex paint, interior", "m2", 3.2], ["Epoxy floor coating", "m2", 12]],
  Earthwork: [["Excavation", "m3", 4], ["Backfill and compaction", "m3", 5]],
  Finishes: [["Ceramic floor tile 60x60", "m2", 16], ["Gypsum board ceiling", "m2", 10]],
};

export function startStandIn(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const meta = { source: "qa-standin", url: `http://localhost:${port}${url.pathname}` };
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/v1/trades") {
      const trades = Object.entries(TRADES).map(([trade, items]) => ({ trade, itemCount: items.length }));
      return void res.end(JSON.stringify({ data: { trades, totalItems: trades.reduce((n, t) => n + t.itemCount, 0) }, meta }));
    }
    if (url.pathname === "/api/v1/costs") {
      const trade = url.searchParams.get("trade") ?? "";
      const items = (TRADES[trade] ?? []).map(([description, unit, typical], i) => ({
        id: `${trade.toLowerCase().replace(/\W+/g, "-")}-${i + 1}`, description, unit, low: +(typical * 0.8).toFixed(2), high: +(typical * 1.25).toFixed(2), typical, volatility: "low",
      }));
      return void res.end(JSON.stringify({ data: { trade, location: "Philippines", multiplier: 1, itemCount: items.length, items }, meta }));
    }
    res.statusCode = 404;
    res.end("{}");
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
