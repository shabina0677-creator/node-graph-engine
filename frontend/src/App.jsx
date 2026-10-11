import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls,
  addEdge, useNodesState, useEdgesState, useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./App.css";
import GraphNode, { DefsContext, ResultsContext } from "./GraphNode";
import * as api from "./api";

function Editor() {
  const { screenToFlowPosition } = useReactFlow();
  const [defs, setDefs] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [results, setResults] = useState({});
  const [graphId, setGraphId] = useState(null);
  const [name, setName] = useState("My graph");
  const [saved, setSaved] = useState([]);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const refreshSaved = useCallback(
    () => api.listGraphs().then(setSaved).catch(() => {}),
    []
  );

  useEffect(() => {
    api.getNodeTypes().then(setDefs).catch((e) => setMessage({ kind: "error", text: e.message }));
    refreshSaved();
  }, [refreshSaved]);

  const defsByType = useMemo(() => Object.fromEntries(defs.map((d) => [d.type, d])), [defs]);
  const nodeTypes = useMemo(() => Object.fromEntries(defs.map((d) => [d.type, GraphNode])), [defs]);

  // Convenience rules so the user can't make a pointless wire. The backend
  // enforces the same things on its own and is the real authority.
  const isValidConnection = useCallback(
    (c) =>
      c.source !== c.target &&
      !edges.some((e) => e.target === c.target && e.targetHandle === c.targetHandle),
    [edges]
  );

  const onConnect = useCallback((c) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/node-type");
      const def = defsByType[type];
      if (!def) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = `${type}_${Math.random().toString(36).slice(2, 8)}`;
      const data = Object.fromEntries(def.fields.map((f) => [f.name, f.default]));
      setNodes((ns) => [...ns, { id, type, position, data }]);
    },
    [defsByType, screenToFlowPosition, setNodes]
  );

  const toPayload = () => ({
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle,
    })),
  });

  const run = async () => {
    setBusy(true);
    try {
      setResults(await api.simulate(toPayload()));
      setMessage(null);
    } catch (e) {
      setResults({});
      setMessage({ kind: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const g = await api.saveGraph(graphId, { name, ...toPayload() });
      setGraphId(g.id);
      setMessage({ kind: "ok", text: "Saved" });
      refreshSaved();
    } catch (e) {
      setMessage({ kind: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const load = async (id) => {
    if (!id) return;
    try {
      const g = await api.loadGraph(id);
      setNodes(g.nodes);
      setEdges(g.edges);
      setGraphId(g.id);
      setName(g.name);
      setResults({});
      setMessage(null);
    } catch (e) {
      setMessage({ kind: "error", text: e.message });
    }
  };

  const reset = () => {
    setNodes([]);
    setEdges([]);
    setResults({});
    setGraphId(null);
    setName("My graph");
    setMessage(null);
  };

  return (
    <div className="app">
      <header className="toolbar">
        <input
          aria-label="Graph name"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
        <button onClick={save} disabled={busy}>Save</button>
        <select aria-label="Saved graphs" value="" onChange={(e) => load(e.target.value)}>
          <option value="">Load a graph...</option>
          {saved.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button onClick={reset}>New</button>
        <button className="primary" onClick={run} disabled={busy}>Run</button>
        {message && <span className={`msg msg-${message.kind}`}>{message.text}</span>}
      </header>

      <aside className="palette">
        <h2>Nodes</h2>
        {defs.map((d) => (
          <div
            key={d.type}
            className="palette-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/node-type", d.type);
              e.dataTransfer.effectAllowed = "move";
            }}
          >
            {d.label}
          </div>
        ))}
        <p className="hint">Drag onto the canvas. Press Backspace to delete a selected node or wire.</p>
      </aside>

      <main className="canvas">
        <DefsContext.Provider value={defsByType}>
          <ResultsContext.Provider value={results}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onDrop={onDrop}
              onDragOver={onDragOver}
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </ResultsContext.Provider>
        </DefsContext.Provider>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
