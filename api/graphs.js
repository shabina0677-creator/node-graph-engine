const express = require("express");
const mongoose = require("mongoose");
const { validateGraph, validateName } = require("./validate");

const Graph = mongoose.model(
  "Graph",
  new mongoose.Schema(
    {
      name: { type: String, required: true, maxlength: 100 },
      nodes: { type: [mongoose.Schema.Types.Mixed], default: [] },
      edges: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    { timestamps: true }
  )
);

const present = (g) => ({
  id: g._id.toString(),
  name: g.name,
  nodes: g.nodes,
  edges: g.edges,
  updatedAt: g.updatedAt,
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const reject = (res, status, error, message) => res.status(status).json({ error, message });

const router = express.Router();

router.param("id", (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return reject(res, 400, "invalid_id", "Graph id is not valid");
  next();
});

router.get("/", wrap(async (req, res) => {
  const list = await Graph.find({}, "name updatedAt").sort({ updatedAt: -1 }).limit(100);
  res.json({ graphs: list.map((g) => ({ id: g._id.toString(), name: g.name, updatedAt: g.updatedAt })) });
}));

router.post("/", wrap(async (req, res) => {
  const body = req.body ?? {};
  const v = validateGraph(body);
  if (!v.ok) return reject(res, 400, "invalid_graph", v.message);
  const n = validateName(body.name);
  if (!n.ok) return reject(res, 400, "invalid_name", n.message);
  const doc = await Graph.create({ name: n.name, ...v.graph });
  res.status(201).json(present(doc));
}));

router.get("/:id", wrap(async (req, res) => {
  const doc = await Graph.findById(req.params.id);
  if (!doc) return reject(res, 404, "not_found", "Graph not found");
  res.json(present(doc));
}));

router.put("/:id", wrap(async (req, res) => {
  const body = req.body ?? {};
  const v = validateGraph(body);
  if (!v.ok) return reject(res, 400, "invalid_graph", v.message);
  const n = validateName(body.name);
  if (!n.ok) return reject(res, 400, "invalid_name", n.message);
  const doc = await Graph.findByIdAndUpdate(
    req.params.id,
    { name: n.name, ...v.graph },
    { new: true }
  );
  if (!doc) return reject(res, 404, "not_found", "Graph not found");
  res.json(present(doc));
}));

module.exports = { router, wrap, reject };
