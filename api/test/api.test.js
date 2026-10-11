const { test, before, after } = require("node:test");
const assert = require("node:assert");

process.env.SIMULATOR_URL = "http://127.0.0.1:1"; // nothing listens here
const app = require("../app");

let server, base;
before(() => new Promise((resolve) => {
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
after(() => { server.closeAllConnections?.(); server.close(); });

const post = (path, body, raw) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });

const node = (id, type = "number") => ({ id, type, position: { x: 0, y: 0 }, data: { value: 1 } });

test("rejects a body that is not valid JSON", async () => {
  const res = await post("/api/simulate", null, "{not json");
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).error, "invalid_json");
});

test("rejects a body with no nodes and edges", async () => {
  const res = await post("/api/simulate", {});
  assert.strictEqual(res.status, 400);
});

test("rejects a node id that tries to inject netlist lines", async () => {
  const res = await post("/api/simulate", { nodes: [node("x\n.control\nshell ls")], edges: [] });
  assert.strictEqual(res.status, 400);
});

test("rejects duplicate node ids, even with different case", async () => {
  const res = await post("/api/simulate", { nodes: [node("A"), node("a")], edges: [] });
  assert.strictEqual(res.status, 400);
});

test("rejects too many nodes", async () => {
  const nodes = Array.from({ length: 201 }, (_, i) => node(`n${i}`));
  const res = await post("/api/simulate", { nodes, edges: [] });
  assert.strictEqual(res.status, 400);
});

test("rejects an oversized body", async () => {
  const res = await post("/api/simulate", { nodes: [], edges: [], junk: "x".repeat(2_000_000) });
  assert.strictEqual(res.status, 413);
});

test("saving a bad graph is rejected before touching the database", async () => {
  const res = await post("/api/graphs", { name: "x", nodes: "nope", edges: [] });
  assert.strictEqual(res.status, 400);
});

test("a malformed graph id is rejected", async () => {
  const res = await fetch(base + "/api/graphs/not-an-id");
  assert.strictEqual(res.status, 400);
});

test("reports 503 when the simulator is unreachable", async () => {
  const res = await post("/api/simulate", { nodes: [node("n1")], edges: [] });
  assert.strictEqual(res.status, 503);
  assert.strictEqual((await res.json()).error, "simulator_unavailable");
});
