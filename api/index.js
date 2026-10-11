const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const SIMULATOR_URL = process.env.SIMULATOR_URL || "http://simulator:8000";

app.get("/api/health", async (req, res) => {
  try {
    const r = await fetch(`${SIMULATOR_URL}/health`);
    res.json({ api: "ok", simulator: (await r.json()).status });
  } catch {
    res.status(503).json({ api: "ok", simulator: "down" });
  }
});

app.listen(4000, () => console.log("API on 4000"));