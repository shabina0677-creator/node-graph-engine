import pytest
from engine import simulate


def number(i, v): return {"id": i, "type": "number", "data": {"value": v}}
def node(i, t):   return {"id": i, "type": t, "data": {}}
def wire(s, t, h): return {"source": s, "target": t, "targetHandle": h}


def test_graph1_add():
    g = {"nodes": [number("n1", 2), number("n2", 3), node("add1", "add"), node("d1", "display")],
         "edges": [wire("n1", "add1", "a"), wire("n2", "add1", "b"), wire("add1", "d1", "x")]}
    assert simulate(g)["d1"]["value"] == pytest.approx(5)


def test_graph2_add_then_multiply():
    g = {"nodes": [number("n1", 2), number("n2", 3), number("n3", 4),
                   node("add1", "add"), node("mul1", "multiply"), node("d1", "display")],
         "edges": [wire("n1", "add1", "a"), wire("n2", "add1", "b"),
                   wire("add1", "mul1", "a"), wire("n3", "mul1", "b"),
                   wire("mul1", "d1", "x")]}
    assert simulate(g)["d1"]["value"] == pytest.approx(20)


def test_graph3_same_number_into_both_inputs():
    g = {"nodes": [number("n1", 7), node("mul1", "multiply"), node("d1", "display")],
         "edges": [wire("n1", "mul1", "a"), wire("n1", "mul1", "b"), wire("mul1", "d1", "x")]}
    assert simulate(g)["d1"]["value"] == pytest.approx(49)
