import subprocess, tempfile, os
from fastapi import FastAPI

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