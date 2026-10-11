// Shape and size checks only. Meaning (loops, unwired inputs, unknown
// node types) is Python's job, so no rule lives in two places.
const ID_RE = /^[A-Za-z0-9_]+$/;
const LIMITS = { nodes: 200, edges: 500, id: 64, type: 32, name: 100 };

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const bad = (message) => ({ ok: false, message });

function validateGraph(body) {
  if (!isObj(body)) return bad("Request body must be a JSON object");
  const { nodes, edges } = body;
  if (!Array.isArray(nodes)) return bad('"nodes" must be an array');
  if (!Array.isArray(edges)) return bad('"edges" must be an array');
  if (nodes.length > LIMITS.nodes) return bad(`A graph can have at most ${LIMITS.nodes} nodes`);
  if (edges.length > LIMITS.edges) return bad(`A graph can have at most ${LIMITS.edges} wires`);

  const seen = new Set();
  const cleanNodes = [];
  for (const [i, n] of nodes.entries()) {
    if (!isObj(n)) return bad(`nodes[${i}] must be an object`);
    if (typeof n.id !== "string" || n.id.length > LIMITS.id || !ID_RE.test(n.id)) {
      return bad(`nodes[${i}].id must be letters, digits or underscores (max ${LIMITS.id})`);
    }
    if (seen.has(n.id.toLowerCase())) return bad(`Duplicate node id "${n.id}"`);
    seen.add(n.id.toLowerCase());
    if (typeof n.type !== "string" || n.type.length > LIMITS.type || !ID_RE.test(n.type)) {
      return bad(`nodes[${i}].type must be a short plain name`);
    }
    if (n.data !== undefined && !isObj(n.data)) return bad(`nodes[${i}].data must be an object`);
    let position = { x: 0, y: 0 };
    if (n.position !== undefined) {
      if (!isObj(n.position) || !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y)) {
        return bad(`nodes[${i}].position must be {x, y} numbers`);
      }
      position = { x: n.position.x, y: n.position.y };
    }
    cleanNodes.push({ id: n.id, type: n.type, position, data: n.data ?? {} });
  }

  const cleanEdges = [];
  for (const [i, e] of edges.entries()) {
    if (!isObj(e)) return bad(`edges[${i}] must be an object`);
    for (const key of ["source", "target", "targetHandle"]) {
      if (typeof e[key] !== "string" || e[key].length > LIMITS.id || !ID_RE.test(e[key])) {
        return bad(`edges[${i}].${key} must be letters, digits or underscores`);
      }
    }
    const sh = e.sourceHandle;
    if (sh != null && (typeof sh !== "string" || sh.length > LIMITS.id)) {
      return bad(`edges[${i}].sourceHandle must be a string`);
    }
    cleanEdges.push({
      id: typeof e.id === "string" ? e.id.slice(0, 128) : `e${i}`,
      source: e.source,
      target: e.target,
      sourceHandle: sh ?? null,
      targetHandle: e.targetHandle,
    });
  }
  return { ok: true, graph: { nodes: cleanNodes, edges: cleanEdges } };
}

function validateName(name) {
  if (name === undefined) return { ok: true, name: "Untitled" };
  if (typeof name !== "string" || !name.trim() || name.length > LIMITS.name) {
    return bad(`"name" must be 1 to ${LIMITS.name} characters`);
  }
  return { ok: true, name: name.trim() };
}

module.exports = { validateGraph, validateName, LIMITS };
