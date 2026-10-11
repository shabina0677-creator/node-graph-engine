import math
import os
import re
import subprocess
import tempfile
from collections import defaultdict, deque

from nodes import NODE_TYPES

SAFE_ID = re.compile(r"^[A-Za-z0-9_]+$")
ZERO = 1e-12      # divisors smaller than this count as zero
OVERFLOW = 1e30   # ngspice silently returns 1e33 for x/0


class GraphError(ValueError):
    """The graph is malformed: the caller's fault (HTTP 422)."""


class SimulatorError(RuntimeError):
    """ngspice hung, crashed or could not be understood (HTTP 503)."""


def net(node_id):
    return f"n_{node_id}".lower()


# ---------- structure and per-node checks (before ngspice) ----------

def check_structure(graph):
    nodes = graph.get("nodes", [])
    seen = set()
    for n in nodes:
        nid = n.get("id")
        if not isinstance(nid, str) or not SAFE_ID.match(nid):
            raise GraphError(f"Invalid node id: {nid!r}")
        if nid.lower() in seen:  # ngspice is case-insensitive
            raise GraphError(f"Duplicate node id: {nid!r}")
        seen.add(nid.lower())
        if n.get("type") not in NODE_TYPES:
            raise GraphError(f"Unknown node type: {n.get('type')!r}")
    by_id = {n["id"]: n for n in nodes}
    for e in graph.get("edges", []):
        src, dst = by_id.get(e.get("source")), by_id.get(e.get("target"))
        if src is None or dst is None:
            raise GraphError("A wire connects to a node that does not exist")
        if not NODE_TYPES[src["type"]]["output"]:
            raise GraphError(f"Node {src['id']} has no output to wire from")
        if e.get("targetHandle") not in NODE_TYPES[dst["type"]]["inputs"]:
            raise GraphError(f"Node {dst['id']} has no input {e.get('targetHandle')!r}")


def number_value(n):
    try:
        v = float(n.get("data", {}).get("value", 0))
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def local_errors(nodes, incoming):
    errors = {}
    for nid, n in nodes.items():
        spec = NODE_TYPES[n["type"]]
        if n["type"] == "number" and number_value(n) is None:
            errors[nid] = "Value must be a finite number"
            continue
        missing = [h for h in spec["inputs"] if not incoming[(nid, h)]]
        crowded = [h for h in spec["inputs"] if len(incoming[(nid, h)]) > 1]
        if missing:
            errors[nid] = f"Input {', '.join(missing)} is not connected"
        elif crowded:
            errors[nid] = f"Input {', '.join(crowded)} has more than one wire"
    return errors


def nodes_in_cycles(ids, successors):
    """A node is in a loop if following its wires leads back to itself."""
    in_cycle = set()
    for start in ids:
        seen, queue = set(), deque(successors[start])
        while queue:
            cur = queue.popleft()
            if cur == start:
                in_cycle.add(start)
                break
            if cur not in seen:
                seen.add(cur)
                queue.extend(successors[cur])
    return in_cycle


def blocked_map(errors, successors):
    """node id -> set of error nodes it is waiting on."""
    blocked = defaultdict(set)
    for bad in errors:
        seen, queue = set(), deque(successors[bad])
        while queue:
            cur = queue.popleft()
            if cur in seen:
                continue
            seen.add(cur)
            if cur not in errors:
                blocked[cur].add(bad)
            queue.extend(successors[cur])
    return blocked


# ---------- netlist and ngspice ----------

def source_ids(nid, nodes, incoming):
    spec = NODE_TYPES[nodes[nid]["type"]]
    return [incoming[(nid, h)][0] for h in spec["inputs"]]


def value_source(nid, nodes, incoming):
    """Which node's net holds the value this node shows."""
    if NODE_TYPES[nodes[nid]["type"]]["output"]:
        return nid
    return source_ids(nid, nodes, incoming)[0]


def build_netlist(nodes, incoming, run_ids):
    lines = ["live graph"]
    for nid in run_ids:
        n = nodes[nid]
        spec = NODE_TYPES[n["type"]]
        if n["type"] == "number":
            lines.append(f"V{nid} {net(nid)} 0 DC {number_value(n)!r}")
        elif "op" in spec:
            a, b = source_ids(nid, nodes, incoming)
            lines.append(f"B{nid} {net(nid)} 0 V = V({net(a)}) {spec['op']} V({net(b)})")
    if len(lines) == 1:
        return None
    return "\n".join(lines + [".op", ".end"]) + "\n"


def run_ngspice(netlist, timeout=5):
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "graph.cir")
        with open(path, "w") as f:
            f.write(netlist)
        try:
            return subprocess.run(["ngspice", "-b", path],
                                  capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            raise SimulatorError("ngspice timed out")
        except OSError as e:
            raise SimulatorError(f"ngspice could not start: {e}")


def parse_op(stdout):
    values, in_section = {}, False
    for line in stdout.splitlines():
        if "Node" in line and "Voltage" in line:
            in_section = True
            continue
        if "Source" in line and "Current" in line:
            break
        if not in_section:
            continue
        parts = line.split()
        if len(parts) == 2:
            try:
                values[parts[0]] = float(parts[1])
            except ValueError:
                pass
    return values


def failed_node(stderr, nodes):
    """ngspice says 'check node n_xyz': map that net back to a node id."""
    m = re.search(r"check node (\S+)", stderr)
    if not m:
        return None
    name = m.group(1).lower()
    return next((nid for nid in nodes if net(nid) == name), None)


def check_values(nodes, incoming, run_ids, voltages):
    """Problems visible only after ngspice ran. Report the root causes only."""
    problems = {}
    for nid in run_ids:
        if nodes[nid]["type"] == "divide":
            divisor = voltages.get(net(incoming[(nid, "b")][0]))
            if divisor is not None and abs(divisor) < ZERO:
                problems[nid] = "Division by zero"
                continue
        v = voltages.get(net(value_source(nid, nodes, incoming)))
        if v is None:
            problems[nid] = "No result from ngspice"
        elif abs(v) >= OVERFLOW:
            problems[nid] = "Result out of range"
    # a node whose input is also a problem is blocked, not a new error
    return {nid: msg for nid, msg in problems.items()
            if not any(s in problems for s in source_ids(nid, nodes, incoming))}


# ---------- main entry point ----------

def simulate(graph):
    check_structure(graph)
    nodes = {n["id"]: n for n in graph.get("nodes", [])}
    incoming, successors = defaultdict(list), defaultdict(list)
    for e in graph.get("edges", []):
        incoming[(e["target"], e["targetHandle"])].append(e["source"])
        successors[e["source"]].append(e["target"])

    errors = local_errors(nodes, incoming)
    for nid in nodes_in_cycles(nodes, successors):
        errors[nid] = "Part of a loop"

    voltages = {}
    for _ in range(len(nodes) + 1):
        blocked = blocked_map(errors, successors)
        run_ids = [i for i in nodes if i not in errors and i not in blocked]
        netlist = build_netlist(nodes, incoming, run_ids)
        voltages = {}
        if netlist:
            result = run_ngspice(netlist)
            if result.returncode != 0:
                bad = failed_node(result.stderr, nodes)
                if bad is None or bad not in run_ids:
                    raise SimulatorError("ngspice failed: " + result.stderr[-200:])
                errors[bad] = "ngspice could not solve this node"
                continue
            voltages = parse_op(result.stdout)
        new = check_values(nodes, incoming, run_ids, voltages)
        if not new:
            break
        errors.update(new)

    blocked = blocked_map(errors, successors)
    results = {}
    for nid in nodes:
        if nid in errors:
            results[nid] = {"status": "error", "value": None,
                            "message": errors[nid], "blockedBy": []}
        elif nid in blocked:
            results[nid] = {"status": "blocked", "value": None,
                            "message": "Waiting on a node with an error",
                            "blockedBy": sorted(blocked[nid])}
        else:
            v = voltages.get(net(value_source(nid, nodes, incoming)))
            results[nid] = {"status": "ok", "value": v,
                            "message": None, "blockedBy": []}
    return results
