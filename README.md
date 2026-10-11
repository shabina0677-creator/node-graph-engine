# Live Node Graph Engine

A browser node editor. Drag Number, Add, Multiply, Divide and Display nodes onto a canvas and wire them together. A Python service turns the graph into an ngspice netlist, runs `ngspice -b`, and returns a result for every node. The canvas updates automatically after every edit.

## Run it

Requires Docker Desktop (with Compose) and about 5 GB of free disk space.

```bash
git clone https://github.com/<your-username>/node-graph-engine.git
cd node-graph-engine
docker compose up --build
```

Open http://localhost:5173 once the logs show `VITE ... ready`.

| Service | URL |
|---|---|
| Frontend (React, Vite) | http://localhost:5173 |
| Node API (Express) | http://localhost:4000 |
| Simulator (FastAPI + ngspice) | http://localhost:8000 |

Check health with `curl localhost:4000/api/health`. You should see `api`, `simulator` and `database` all `ok`.

Run the tests:

```bash
docker compose run --rm simulator python -m pytest -q
docker compose run --rm api npm test
```

Stop everything with `docker compose down`. Saved graphs are kept in a Docker volume.

## Architecture

```
Browser (React + React Flow)
        |  JSON over HTTP
        v
Node API (Express) <---> MongoDB (saved graphs)
        |  JSON over HTTP
        v
Simulator (FastAPI) ---> ngspice -b (subprocess)
```

| Layer | Owns |
|---|---|
| React | Drawing, drag and drop, showing results and states. Node definitions come from the API, so nothing in React knows what "Add" means. |
| Node API | Request shape and size validation, save and load, timeouts, clean HTTP errors. |
| Python | All meaning: node types, graph checks, loops, netlist, running ngspice, parsing, attributing errors to nodes. |

Each rule lives in one place. Node checks that a request is sane, Python checks that the graph makes sense. The wiring rules in the UI (no self-wire, one wire per input) are only a convenience, and the backend reports the same problems on its own.

## Graph to netlist, and loop detection

Every node's output is a net named `n_<id>`. A wire does not create a net, it just means the target reads the source's net, so one output can feed many inputs and one node can feed both inputs of another (graph 3 works with no special case). Each node maps to one line from the provided table (`V...` for Number, `B... V = V(a) op V(b)` for operators). Display has no line and reads the net that feeds it. The result is read from the voltage table that `.op` prints.

We tested what ngspice does on bad input: divide by zero returns exit code 0 and a made-up `1e33`, and a loop returns plausible wrong numbers. So both are caught by us, not by ngspice.

- **Loops:** for each node, follow its outgoing wires. If we get back to the start, the node is on a loop and is flagged.
- **Unwired or doubled inputs:** flagged on that node before ngspice runs.
- **Divide by zero:** after the run we check each divisor, mark the divide node, then rerun without its dependents.
- **Blocked:** every node downstream of an error is marked `blocked` with the nodes it waits on, so it never shows an old value.

Only healthy nodes go into the netlist, so one broken branch cannot affect a working one.

## Step 5: staying in sync

**1. Fast edits.** Every graph change bumps a version counter and aborts the request in flight. A response is applied only if its version is still the newest. Edits are debounced by 300 ms, and the graph signature ignores positions, so dragging a node never triggers a run. Results carry the signature of the graph they came from, so a changed graph shows an ellipsis instead of an older number.

**2. Errors on the right node.** Python reports `status` (ok, error or blocked), `message` and `blockedBy` for every node. The UI shows a red border and message on the culprit and a dashed amber "Blocked by ..." on dependents, instead of a generic failure.

**3. ngspice misbehaves.** ngspice has a 5 s timeout, the API has an 8 s timeout, and the browser has a 12 s timeout. A hang, crash or missing service becomes a 503 and a visible "retrying" state, with retries after 1, 2, 4, then every 8 seconds. When the service returns, the canvas updates by itself. Dragging, saving and loading keep working meanwhile. The API also cancels its call to Python if the browser disconnects.

**4. Untrusted formulas.** Status: the Formula node is not built yet. Node ids and Number values are already validated before they enter a netlist (ids must be letters, digits and underscores, values must be finite). The Formula node will use a whitelist parser that accepts only numbers, `a`, `b`, `+ - * /` and brackets, and rebuilds the expression from validated tokens so a newline or `.control shell ls` never reaches ngspice.

**One case that still breaks.** Cancelling a request stops the API's call to Python, but a simulation already running finishes on its worker thread (up to the 5 s timeout). Many requests that each hang ngspice could use up the thread pool. A bounded worker pool with a hard process kill would fix it.

## Acceptance graphs

| # | Graph | Expected | Status |
|---|---|---|---|
| 1 | 2 and 3 into Add into Display | 5 | Done, tested |
| 2 | Add into Multiply with 4 | 20 | Done, tested |
| 3 | 7 into both Multiply inputs | 49 | Done, tested |
| 4 | 10 divided by 0 | Divide shows error, Display blocked | Done, tested |
| 5 | Add with one input wired | That Add highlighted | Done, tested |
| 6 | Loop Add, Multiply, back to Add | Loop flagged on involved nodes | Done, tested |
| 7 | Formula `a * 2 + b`, a=3, b=4 | 10 | Not built yet |
| 8 | Formula with newline and `.control shell ls` | Rejected, nothing executes | Not built yet |

## API

`GET /api/health`, `GET /api/node-types`, `POST /api/simulate`, `GET` and `POST /api/graphs`, `GET` and `PUT /api/graphs/:id`. Errors always look like `{"error": "code", "message": "..."}` with 400 for bad input, 413 for oversized bodies, 422 for a rejected graph and 503 when the simulator is unavailable. Limits: 200 nodes, 500 wires, 1 MB body.

## Adding a node type

Add one entry to `NODE_TYPES` in `simulator/nodes.py` (label, inputs, operator), then run `docker compose up -d --build simulator`. The API and palette pick it up from `/api/node-types` with no other change.

## What I'd do next

- Finish the Formula node and its tests for graphs 7 and 8
- Bounded worker pool in the simulator with hard process kill
- Authentication and per-user graphs
- Production frontend build behind a real web server
- Undo and redo, more function nodes, browser end-to-end tests

## AI usage

<!-- Edit this note so it matches how you really used AI. -->
I used Claude to plan the architecture, draft code and tests, and debug Docker and Git problems. I ran and tested everything myself and can explain and change every file without AI help.
