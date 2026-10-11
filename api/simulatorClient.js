const SIMULATOR_URL = process.env.SIMULATOR_URL || "http://simulator:8000";
const TIMEOUT_MS = Number(process.env.SIMULATOR_TIMEOUT_MS || 8000);

class SimulatorUnavailable extends Error {}
class GraphRejected extends Error {}

async function simulate(graph) {
  let res;
  try {
    res = await fetch(`${SIMULATOR_URL}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(graph),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new SimulatorUnavailable(
      e.name === "TimeoutError" ? "Simulator timed out" : "Simulator is not reachable"
    );
  }
  if (res.status === 422) {
    const body = await res.json().catch(() => ({}));
    throw new GraphRejected(typeof body.detail === "string" ? body.detail : "Graph rejected");
  }
  if (!res.ok) throw new SimulatorUnavailable(`Simulator returned status ${res.status}`);
  return (await res.json()).results;
}

module.exports = { simulate, SimulatorUnavailable, GraphRejected, SIMULATOR_URL };
