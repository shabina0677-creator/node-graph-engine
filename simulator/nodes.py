# Single source of truth for node types on the Python side.
# To add a node (e.g. subtract): add one entry here.
NODE_TYPES = {
    "number":   {"inputs": [],         "output": True},
    "add":      {"inputs": ["a", "b"], "output": True, "op": "+"},
    "multiply": {"inputs": ["a", "b"], "output": True, "op": "*"},
    "divide":   {"inputs": ["a", "b"], "output": True, "op": "/"},
    "display":  {"inputs": ["x"],      "output": False},
}
