const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error("Can't reach the server");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
  return body;
}

export const getNodeTypes = () => request("/api/node-types").then((b) => b.nodeTypes);
export const listGraphs = () => request("/api/graphs").then((b) => b.graphs);
export const loadGraph = (id) => request(`/api/graphs/${id}`);
export const simulate = (graph) =>
  request("/api/simulate", { method: "POST", body: JSON.stringify(graph) }).then((b) => b.results);
export const saveGraph = (id, payload) =>
  id
    ? request(`/api/graphs/${id}`, { method: "PUT", body: JSON.stringify(payload) })
    : request("/api/graphs", { method: "POST", body: JSON.stringify(payload) });
