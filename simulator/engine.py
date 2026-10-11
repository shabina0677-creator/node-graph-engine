import math
import os
import re
import subprocess
import tempfile

from nodes import NODE_TYPES

SAFE_ID = re.compile(r"^[A-Za-z0-9_]+$")


def net(node_id):
    return f"n_{node_id}".lower()


def build_netlist(graph):
    incoming = {(e["target"], e["targetHandle"]): e["source"] for e in graph["edges"]}
    lines = ["live graph"]

    for n in graph["nodes"]:
        nid, spec = n["id"], NODE_TYPES[n["type"]]
        if not SAFE_ID.match(nid):
            raise ValueError(f"Invalid node id: {nid!r}")

        if n["type"] == "number":
            value = float(n["data"].get("value", 0))
            if not math.isfinite(value):
                raise ValueError(f"Node {nid}: value must be a finite number")
            lines.append(f"V{nid} {net(nid)} 0 DC {value!r}")
        elif "op" in spec:
            a, b = (incoming.get((nid, h)) for h in spec["inputs"])
            if a is None or b is None:
                raise ValueError(f"Node {nid}: input not connected")
            lines.append(f"B{nid} {net(nid)} 0 V = V({net(a)}) {spec['op']} V({net(b)})")

    lines += [".op", ".end"]
    return "\n".join(lines) + "\n"


def run_ngspice(netlist, timeout=5):
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "graph.cir")
        with open(path, "w") as f:
            f.write(netlist)
        return subprocess.run(["ngspice", "-b", path],
                              capture_output=True, text=True, timeout=timeout)


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


def simulate(graph):
    netlist = build_netlist(graph)
    result = run_ngspice(netlist)
    voltages = parse_op(result.stdout)

    incoming = {(e["target"], e["targetHandle"]): e["source"] for e in graph["edges"]}
    out = {}
    for n in graph["nodes"]:
        if NODE_TYPES[n["type"]]["output"]:
            out[n["id"]] = {"value": voltages.get(net(n["id"]))}
        else:
            src = incoming.get((n["id"], "x"))
            out[n["id"]] = {"value": voltages.get(net(src)) if src else None}
    return out
