const SIMULATOR_URL = process.env.SIMULATOR_URL || "http://simulator:8000";
const TIMEOUT_MS = Number(process.env.SIMULATOR_TIMEOUT_MS || 8000);

class SimulatorUnavailable extends Error {}
class GraphRejected extends Error {}
class RequestCancelled extends Error {}

async function call(path, options = {}, signal) {
  const signals = [AbortSignal.timeout(TIMEOUT_MS)];
  if (signal) signals.push(signal);
  try {
    return await fetch(`${SIMULATOR_URL}${path}`, {
      ...options,
      signal: AbortSignal.any(signals),
    });
  } catch (e) {
    if (signal?.aborted) throw new RequestCancelled();
    throw new SimulatorUnavailable(
      e.name === "TimeoutError" ? "Simulator timed out" : "Simulator is not reachable"
    );
  }
}

async function simulate(graph, signal) {
  const res = await call("/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(graph),
  }, signal);
  if (res.status === 422) {
    const body = await res.json().catch(() => ({}));
    throw new GraphRejected(typeof body.detail === "string" ? body.detail : "Graph rejected");
  }
  if (!res.ok) throw new SimulatorUnavailable(`Simulator returned status ${res.status}`);
  return (await res.json()).results;
}

async function nodeTypes() {
  const res = await call("/node-types");
  if (!res.ok) throw new SimulatorUnavailable(`Simulator returned status ${res.status}`);
  return (await res.json()).nodeTypes;
}

module.exports = {
  simulate, nodeTypes, SimulatorUnavailable, GraphRejected, RequestCancelled, SIMULATOR_URL,
};
