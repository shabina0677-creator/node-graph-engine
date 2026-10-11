import { createContext, useContext } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";

export const DefsContext = createContext({});
export const ResultsContext = createContext({});

function formatValue(v) {
  if (v === null || v === undefined) return "-";
  return String(Number.parseFloat(Number(v).toPrecision(10)));
}

// One component renders every node type. It is driven entirely by the
// definition the API sends, so nothing here knows what "Add" means.
export default function GraphNode({ id, type, data }) {
  const defs = useContext(DefsContext);
  const results = useContext(ResultsContext);
  const { updateNodeData } = useReactFlow();

  const def = defs[type];
  if (!def) return <div className="gn gn-error">Unknown node type: {type}</div>;

  const result = results[id];
  const status = result?.status ?? "idle";

  return (
    <div className={`gn gn-${status}`}>
      <div className="gn-title">{def.label}</div>

      {def.inputs.map((name) => (
        <div className="gn-row gn-in" key={name}>
          <Handle type="target" position={Position.Left} id={name} />
          <span>{name}</span>
        </div>
      ))}

      {def.fields.map((f) => (
        <div className="gn-row" key={f.name}>
          <input
            className="nodrag"
            type="number"
            aria-label={`${def.label} ${f.name}`}
            value={data[f.name] ?? f.default}
            onChange={(e) => updateNodeData(id, { [f.name]: e.target.value })}
          />
        </div>
      ))}

      {status === "ok" && def.fields.length === 0 && (
        <div className="gn-row gn-result">{formatValue(result.value)}</div>
      )}
      {status === "error" && <div className="gn-row gn-result">{result.message}</div>}
      {status === "blocked" && (
        <div className="gn-row gn-result">Blocked by {result.blockedBy.join(", ")}</div>
      )}

      {def.hasOutput && (
        <div className="gn-row gn-out">
          <span>out</span>
          <Handle type="source" position={Position.Right} id="out" />
        </div>
      )}
    </div>
  );
}
