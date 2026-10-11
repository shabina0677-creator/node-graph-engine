import os
import subprocess
import tempfile

from fastapi import FastAPI, HTTPException

from engine import GraphError, SimulatorError, simulate

app = FastAPI()

TEST_NETLIST = """smoke test
V1 n1 0 DC 2
V2 n2 0 DC 3
B1 n3 0 V = V(n1) + V(n2)
.op
.end
"""


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ngspice-check")
def ngspice_check():
    with tempfile.NamedTemporaryFile("w", suffix=".cir", delete=False) as f:
        f.write(TEST_NETLIST)
        path = f.name
    try:
        r = subprocess.run(["ngspice", "-b", path],
                           capture_output=True, text=True, timeout=5)
        return {"returncode": r.returncode, "stdout": r.stdout, "stderr": r.stderr}
    finally:
        os.remove(path)


@app.post("/simulate")
def simulate_endpoint(graph: dict):
    try:
        return {"results": simulate(graph)}
    except GraphError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except SimulatorError as e:
        raise HTTPException(status_code=503, detail=str(e))
