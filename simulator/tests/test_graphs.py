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


from engine import GraphError


def test_graph4_divide_by_zero_blocks_display():
    g = {"nodes": [number("n1", 10), number("n2", 0), node("div1", "divide"), node("d1", "display")],
         "edges": [wire("n1", "div1", "a"), wire("n2", "div1", "b"), wire("div1", "d1", "x")]}
    r = simulate(g)
    assert r["div1"]["status"] == "error"
    assert "zero" in r["div1"]["message"].lower()
    assert r["d1"]["status"] == "blocked"
    assert r["d1"]["value"] is None
    assert r["d1"]["blockedBy"] == ["div1"]


def test_graph5_unwired_input_flags_that_node():
    g = {"nodes": [number("n1", 2), node("add1", "add")],
         "edges": [wire("n1", "add1", "a")]}
    r = simulate(g)
    assert r["add1"]["status"] == "error"
    assert "not connected" in r["add1"]["message"]


def test_graph6_loop_flags_nodes_involved():
    g = {"nodes": [number("n1", 1), number("n2", 2), node("add1", "add"),
                   node("mul1", "multiply"), node("d1", "display")],
         "edges": [wire("n1", "add1", "a"), wire("mul1", "add1", "b"),
                   wire("add1", "mul1", "a"), wire("n2", "mul1", "b"),
                   wire("mul1", "d1", "x")]}
    r = simulate(g)
    assert r["add1"]["status"] == "error" and "loop" in r["add1"]["message"].lower()
    assert r["mul1"]["status"] == "error"
    assert r["d1"]["status"] == "blocked"
    assert r["n1"]["status"] == "ok"


def test_broken_branch_does_not_poison_working_branch():
    g = {"nodes": [number("n1", 2), number("n2", 3), node("add1", "add"), node("d1", "display"),
                   number("n3", 1), number("n4", 0), node("div1", "divide"), node("d2", "display")],
         "edges": [wire("n1", "add1", "a"), wire("n2", "add1", "b"), wire("add1", "d1", "x"),
                   wire("n3", "div1", "a"), wire("n4", "div1", "b"), wire("div1", "d2", "x")]}
    r = simulate(g)
    assert r["d1"]["status"] == "ok" and r["d1"]["value"] == pytest.approx(5)
    assert r["d2"]["status"] == "blocked"


def test_two_wires_into_one_input_is_an_error_on_that_node():
    g = {"nodes": [number("n1", 1), number("n2", 2), number("n3", 3), node("add1", "add")],
         "edges": [wire("n1", "add1", "a"), wire("n2", "add1", "a"), wire("n3", "add1", "b")]}
    assert simulate(g)["add1"]["status"] == "error"


def test_unsafe_node_id_is_rejected():
    g = {"nodes": [{"id": "x\n.control\nshell ls", "type": "number", "data": {"value": 1}}],
         "edges": []}
    with pytest.raises(GraphError):
        simulate(g)
