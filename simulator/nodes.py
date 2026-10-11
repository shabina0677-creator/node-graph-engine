# Single source of truth for node types. React gets this list through the API.
# To add a node (e.g. subtract): add one entry here.
NODE_TYPES = {
    "number": {
        "label": "Number", "inputs": [], "output": True,
        "fields": [{"name": "value", "kind": "number", "default": 0}],
    },
    "add":      {"label": "Add",      "inputs": ["a", "b"], "output": True, "op": "+"},
    "multiply": {"label": "Multiply", "inputs": ["a", "b"], "output": True, "op": "*"},
    "divide":   {"label": "Divide",   "inputs": ["a", "b"], "output": True, "op": "/"},
    "display":  {"label": "Display",  "inputs": ["x"],      "output": False},
}


def public_node_types():
    """What the UI may know: no netlist details, just shape."""
    return [
        {"type": t, "label": s["label"], "inputs": s["inputs"],
         "hasOutput": s["output"], "fields": s.get("fields", [])}
        for t, s in NODE_TYPES.items()
    ]
