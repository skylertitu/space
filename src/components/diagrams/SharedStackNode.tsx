'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface LayerData {
  id: string;
  label: string;
  path?: string;
  icon?: React.ComponentType<{ className?: string }>;
  theme?: string;
  subLayers?: LayerData[];
}

interface SharedStackNodeProps {
  layers: LayerData[];
  entityId: string;
  onLayerClick: (layer: LayerData, position: { x: number; y: number }) => void;
  themes: Record<string, any>;
}

const SPRING_CONFIG = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

const HOVER_SPRING = {
  type: 'spring' as const,
  stiffness: 280,
  damping: 28,
};

const LABEL_SPRING = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

export const SharedStackNode: React.FC<SharedStackNodeProps> = ({
  layers,
  entityId,
  onLayerClick,
  themes,
}) => {
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Calculate z-positions and offsets
  const layerPositions: Record<string, { zPosition: number; xOffset: number; isAboveHovered: boolean }> = {};
  let currentZ = 0;

  layers.forEach((layer, index) => {
    const baseZ = currentZ;
    layerPositions[layer.id] = {
      zPosition: baseZ,
      xOffset: 0,
      isAboveHovered: hoveredId ? index > layers.findIndex(l => l.id === hoveredId) : false,
    };
    currentZ += 15;

    if (layer.subLayers && expandedLayer === layer.id) {
      layer.subLayers.forEach((subLayer, subIndex) => {
        layerPositions[subLayer.id] = {
          zPosition: baseZ + (subIndex * 8),
          xOffset: subIndex * -180,
          isAboveHovered: false,
        };
      });
    }
  });

  const handleLayerInteraction = (layer: LayerData, e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const position = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    if (layer.subLayers) {
      setExpandedLayer(expandedLayer === layer.id ? null : layer.id);
    } else {
      onLayerClick(layer, position);
    }
  };

  const layerTheme = (layer: LayerData) => themes[layer.theme || 'cyan'];

  return (
    <div className="relative w-full h-[600px] flex items-center justify-center perspective">
      {/* Glass Layers Stack */}
      <div
        className="absolute w-[240px] md:w-[380px] h-[240px] md:h-[380px]"
        style={{
          perspective: '99999px',
        }}
      >
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            transformStyle: 'preserve-3d',
            transform: 'rotateX(55deg) rotateZ(-45deg)',
          }}
        >
          {/* Visible Layers */}
          {layers.map((layer) => {
            const pos = layerPositions[layer.id];
            const theme = layerTheme(layer);
            const isHovered = hoveredId === layer.id;
            const Icon = layer.icon;

            return (
              <motion.div
                key={layer.id}
                className="absolute inset-0 rounded-[2.5rem] cursor-grab active:cursor-grabbing backdrop-blur-xl transition-colors duration-500"
                animate={{
                  z: isHovered ? pos.zPosition + 40 : pos.zPosition,
                  x: pos.xOffset,
                }}
                transition={SPRING_CONFIG}
                onPointerEnter={() => setHoveredId(layer.id)}
                onPointerLeave={() => setHoveredId(null)}
                onPointerUp={(e) => {
                  const pointerDownTarget = e.currentTarget;
                  const distance = Math.abs(e.clientX - (e as any).pointerDownX || 0);
                  if (distance < 5) {
                    handleLayerInteraction(layer, e as any);
                  }
                }}
                style={{
                  transformStyle: 'preserve-3d',
                  backgroundColor: isHovered ? theme.bg : 'rgba(255, 255, 255, 0.04)',
                  borderTop: isHovered ? '2px solid rgba(255,255,255,0.7)' : '1px solid rgba(255, 255, 255, 0.2)',
                  borderLeft: isHovered ? '2px solid rgba(255,255,255,0.7)' : '1px solid rgba(255, 255, 255, 0.2)',
                  borderBottom: isHovered ? `1px solid ${theme.border}` : '1px solid rgba(255, 255, 255, 0.01)',
                  borderRight: isHovered ? `1px solid ${theme.border}` : '1px solid rgba(255, 255, 255, 0.01)',
                  boxShadow: isHovered
                    ? `inset 0 0 50px ${theme.shadow}, 0 40px 60px rgba(0,0,0,0.6)`
                    : `inset 0 0 10px rgba(255,255,255,0.05), 0 15px 30px rgba(0,0,0,0.5)`,
                }}
              >
                {/* Hover Bloom */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      className={`absolute inset-0 m-auto w-[60%] h-[60%] ${theme.blur} blur-[50px] rounded-full pointer-events-none`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={HOVER_SPRING}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}

          {/* Expanded Sub-Layers */}
          {layers.map((layer) => {
            if (layer.subLayers && expandedLayer === layer.id) {
              return layer.subLayers.map((subLayer, subIndex) => {
                const theme = layerTheme(subLayer);
                const pos = layerPositions[subLayer.id];

                return (
                  <motion.div
                    key={subLayer.id}
                    className="absolute inset-0 rounded-[2rem] cursor-grab active:cursor-grabbing backdrop-blur-xl"
                    animate={{
                      z: pos.zPosition,
                      x: pos.xOffset,
                    }}
                    transition={SPRING_CONFIG}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                      borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: `inset 0 0 10px rgba(255,255,255,0.03)`,
                    }}
                    onPointerUp={(e) => handleLayerInteraction(subLayer, e as any)}
                  />
                );
              });
            }
            return null;
          })}
        </div>
      </div>

      {/* Floating Label (Hover) */}
      <AnimatePresence>
        {hoveredId && (
          <motion.div
            initial={{ opacity: 0, x: 20, y: 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 20, y: 0 }}
            transition={LABEL_SPRING}
            className="absolute left-full ml-12 top-1/2 -translate-y-1/2 pointer-events-none z-[100]"
          >
            {(() => {
              const layer = layers.find(l => l.id === hoveredId);
              if (!layer) return null;

              const theme = layerTheme(layer);
              const Icon = layer.icon;

              return (
                <div className="flex items-center gap-2.5 px-4 py-2.5 bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                  {Icon && <Icon className={`w-4 h-4 ${theme.iconText}`} />}
                  <span className="text-xs font-medium text-white/90 tracking-wide whitespace-nowrap">
                    {layer.label}
                  </span>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
