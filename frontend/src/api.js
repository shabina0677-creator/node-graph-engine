import { SYNC } from "./config";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

// kind: "network" | "timeout" | "unavailable" (5xx) | "rejected" (4xx)
export class ApiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

async function request(path, { signal, timeoutMs = 15000, ...options } = {}) {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (signal) signals.push(signal);
  let res;
  try {
    res = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
      signal: AbortSignal.any(signals),
    });
  } catch (e) {
    if (e.name === "AbortError") throw e; // we cancelled it ourselves
    if (e.name === "TimeoutError") throw new ApiError("timeout", "The server took too long to answer");
    throw new ApiError("network", "Can't reach the server");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status >= 500 ? "unavailable" : "rejected",
      body.message || `Request failed (${res.status})`
    );
  }
  return body;
}

export const getNodeTypes = () => request("/api/node-types").then((b) => b.nodeTypes);
export const listGraphs = () => request("/api/graphs").then((b) => b.graphs);
export const loadGraph = (id) => request(`/api/graphs/${id}`);
export const simulate = (graph, signal) =>
  request("/api/simulate", {
    method: "POST",
    body: JSON.stringify(graph),
    signal,
    timeoutMs: SYNC.requestTimeoutMs,
  }).then((b) => b.results);
export const saveGraph = (id, payload) =>
  id
    ? request(`/api/graphs/${id}`, { method: "PUT", body: JSON.stringify(payload) })
    : request("/api/graphs", { method: "POST", body: JSON.stringify(payload) });
