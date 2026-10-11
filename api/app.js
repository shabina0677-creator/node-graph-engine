const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { router: graphs, wrap, reject } = require("./graphs");
const { validateGraph } = require("./validate");
const { simulate, SimulatorUnavailable, GraphRejected, SIMULATOR_URL } = require("./simulatorClient");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", wrap(async (req, res) => {
  let simulator = "down";
  try {
    const r = await fetch(`${SIMULATOR_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) simulator = "ok";
  } catch {}
  const database = mongoose.connection.readyState === 1 ? "ok" : "down";
  res.status(simulator === "ok" && database === "ok" ? 200 : 503).json({ api: "ok", simulator, database });
}));

app.post("/api/simulate", wrap(async (req, res) => {
  const v = validateGraph(req.body);
  if (!v.ok) return reject(res, 400, "invalid_graph", v.message);
  try {
    res.json({ results: await simulate(v.graph) });
  } catch (e) {
    if (e instanceof GraphRejected) return reject(res, 422, "graph_rejected", e.message);
    if (e instanceof SimulatorUnavailable) return reject(res, 503, "simulator_unavailable", e.message);
    throw e;
  }
}));

app.use("/api/graphs", graphs);

app.use((req, res) => reject(res, 404, "not_found", "No such route"));

app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") return reject(res, 413, "payload_too_large", "Request body is too large");
  if (err.type === "entity.parse.failed") return reject(res, 400, "invalid_json", "Request body is not valid JSON");
  console.error(err);
  reject(res, 500, "internal_error", "Something went wrong on the server");
});

module.exports = app;
