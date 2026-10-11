import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls,
  addEdge, useNodesState, useEdgesState, useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./App.css";
import GraphNode, { DefsContext, ResultsContext } from "./GraphNode";
import * as api from "./api";
import { SYNC } from "./config";

function Editor() {
  const { screenToFlowPosition } = useReactFlow();
  const [defs, setDefs] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [graphId, setGraphId] = useState(null);
  const [name, setName] = useState("My graph");
  const [saved, setSaved] = useState([]);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  // Live sync state
  const [view, setView] = useState({ sig: null, results: {} });
  const [sync, setSync] = useState({ state: "idle", message: null });
  const versionRef = useRef(0);
  const controllerRef = useRef(null);
  const retryRef = useRef(null);

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

  // The signature IS the graph the backend sees: no positions, so dragging a
  // node never triggers a run. Same string means same graph.
  const sig = useMemo(
    () =>
      JSON.stringify({
        nodes: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
        edges: edges.map((e) => ({
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle,
        })),
      }),
    [nodes, edges]
  );

  const runSync = useCallback(async (graphSig, version, attempt) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setSync({ state: "running", message: null });
    try {
      const results = await api.simulate(JSON.parse(graphSig), controller.signal);
      if (version !== versionRef.current) return; // the graph moved on: drop it
      setView({ sig: graphSig, results });
      setSync({ state: "synced", message: null });
    } catch (e) {
      if (e.name === "AbortError" || version !== versionRef.current) return;
      if (e.kind === "rejected") {
        setView({ sig: graphSig, results: {} });
        setSync({ state: "rejected", message: e.message });
        return;
      }
      // Network, timeout or simulator trouble: say so, retry with backoff.
      const delays = SYNC.retryDelaysMs;
      const delay = delays[Math.min(attempt, delays.length - 1)];
      setSync({ state: "offline", message: e.message });
      retryRef.current = setTimeout(() => runSync(graphSig, version, attempt + 1), delay);
    }
  }, []);

  useEffect(() => {
    const version = ++versionRef.current; // this graph is now the newest
    clearTimeout(retryRef.current);
    controllerRef.current?.abort(); // anything still in flight is obsolete

    if (JSON.parse(sig).nodes.length === 0) {
      setView({ sig, results: {} });
      setSync({ state: "idle", message: null });
      return;
    }
    setSync({ state: "pending", message: null });
    const timer = setTimeout(() => runSync(sig, version, 0), SYNC.debounceMs);
    return () => clearTimeout(timer);
  }, [sig, runSync]);

  useEffect(
    () => () => {
      clearTimeout(retryRef.current);
      controllerRef.current?.abort();
    },
    []
  );

  const stale = view.sig !== sig;
  const resultsValue = useMemo(() => ({ results: view.results, stale }), [view.results, stale]);

  // Convenience rules so the user can't make a pointless wire. The backend
  // reports the same problems on its own and is the real authority.
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

  const toSavePayload = () => ({
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle,
    })),
  });

  const save = async () => {
    setBusy(true);
    try {
      const g = await api.saveGraph(graphId, { name, ...toSavePayload() });
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
      setMessage(null);
    } catch (e) {
      setMessage({ kind: "error", text: e.message });
    }
  };

  const reset = () => {
    setNodes([]);
    setEdges([]);
    setGraphId(null);
    setName("My graph");
    setMessage(null);
  };

  const syncText = {
    idle: "Add nodes to start",
    pending: "Updating…",
    running: "Updating…",
    synced: "Up to date",
    offline: `${sync.message}. Retrying…`,
    rejected: sync.message,
  }[sync.state];

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
        {message && <span className={`msg msg-${message.kind}`}>{message.text}</span>}
        <span className={`sync sync-${sync.state}`} role="status" aria-live="polite">
          {syncText}
        </span>
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
          <ResultsContext.Provider value={resultsValue}>
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
