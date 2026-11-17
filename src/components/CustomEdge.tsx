
// src/components/CustomEdge.tsx
import React, { useState } from 'react';
import { getBezierPath, EdgeProps, EdgeLabelRenderer, useReactFlow } from 'reactflow';
import { X } from 'lucide-react';

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [hovered, setHovered] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const active = selected || hovered;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEdges((eds) => eds.filter((edge) => edge.id !== id));
  };

  return (
    <>
      {/* Línea invisible ancha para facilitar la selección / hover (también en táctil) */}
      <path
        id={`${id}_interaction`}
        style={{ stroke: 'transparent', strokeWidth: 24, cursor: 'pointer' }}
        className="react-flow__edge-path"
        d={edgePath}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      {/* Línea visible */}
      <path
        id={id}
        style={{
          ...style,
          strokeWidth: active ? 3 : 1.75,
          stroke: active ? '#8b5cf6' : '#52525b',
          transition: 'stroke 0.2s ease, stroke-width 0.2s ease',
          filter: active ? 'drop-shadow(0 0 4px rgba(139,92,246,0.6))' : 'none',
        }}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />

      {/* Botón de desconexión: aparece en hover o cuando la conexión está seleccionada */}
      {active && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <button
              onClick={handleDelete}
              title="Eliminar conexión"
              aria-label="Eliminar conexión"
              className="flex items-center justify-center w-6 h-6 rounded-full bg-neutral-950 border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 shadow-lg transition-all duration-150 hover:scale-110"
            >
              <X className="w-3.5 h-3.5" strokeWidth={3} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
