'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useMissionControl } from '@/lib/store';
import {
  type OfficeState, type OfficeChar,
  createOfficeState, addCharacter, updateState, renderOffice, getCharScreenPos, findPath,
} from './engine';
import { BUBBLES } from './sprites';
import type { Agent } from '@/lib/types';

// ── PixelOffice Component ──────────────────────────────

export default function PixelOffice() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OfficeState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scaleRef = useRef(3);
  const [labels, setLabels] = useState<{ id: string; name: string; emoji: string; x: number; y: number; status: string; taskName: string; isSubAgent: boolean }[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const agents = useMissionControl(s => s.agents);
  const tasks = useMissionControl(s => s.tasks);
  const events = useMissionControl(s => s.events);
  const storeSelectAgent = useMissionControl(s => s.setSelectedAgent);

  // Sync agents from store → office state
  const syncAgents = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;

    const agentIds = new Set(agents.map(a => a.id));

    // Remove chars that no longer exist
    for (const id of Array.from(state.chars.keys())) {
      if (!agentIds.has(id)) {
        const desk = state.desks.find(d => d.occupantId === id);
        if (desk) {
          desk.occupantId = null;
          desk.monitorOn = false;
        }
        state.chars.delete(id);
      }
    }

    // Add/update chars
    for (const agent of agents) {
      const existing = state.chars.get(agent.id);
      const agentTasks = tasks.filter(t => t.assigned_agent_id === agent.id && t.status !== 'done');
      const taskName = agentTasks[0]?.title || '';

      if (existing) {
        // Update status
        const wasWorking = existing.status === 'working';
        existing.status = agent.status;
        existing.taskName = taskName;
        existing.name = agent.name;
        existing.emoji = agent.avatar_emoji || '🤖';

        // Status changed
        if (agent.status === 'working' && !wasWorking) {
          existing.bubble = BUBBLES.working;
          existing.bubbleTimer = 0;
          // Walk to desk
          const desk = state.desks.find(d => d.occupantId === agent.id);
          if (desk) desk.monitorOn = true;
          if (existing.x !== existing.seatX || existing.y !== existing.seatY) {
            const grid = Array.from({ length: state.gridH }, () => Array(state.gridW).fill(1));
            state.desks.forEach(d => {
              for (let dy = 0; dy < 2; dy++)
                for (let dx = 0; dx < 2; dx++)
                  if (grid[d.y + dy]) grid[d.y + dy][d.x + dx] = 0;
            });
            existing.path = findPath(grid, existing.x, existing.y, existing.seatX, existing.seatY);
            existing.pathIdx = 0;
            existing.moveProgress = 0;
          }
        } else if (agent.status !== 'working' && wasWorking) {
          existing.bubble = BUBBLES.done;
          existing.bubbleTimer = 3000;
          const desk = state.desks.find(d => d.occupantId === agent.id);
          if (desk) desk.monitorOn = false;
        }
      } else {
        addCharacter(state, agent.id, agent.name, agent.avatar_emoji || '🤖', agent.status, taskName, false);
      }
    }
  }, [agents, tasks]);

  // Initialize office
  useEffect(() => {
    const count = Math.max(4, agents.length);
    stateRef.current = createOfficeState(count);
    syncAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.length]);

  // Sync on agent/task changes
  useEffect(() => {
    syncAgents();
  }, [syncAgents]);

  // React to events (show bubbles)
  useEffect(() => {
    const state = stateRef.current;
    if (!state || events.length === 0) return;
    const latest = events[events.length - 1];
    if (latest?.agent_id) {
      const char = state.chars.get(latest.agent_id);
      if (char) {
        if (latest.type === 'task_completed' || latest.type === 'task_status_changed') {
          char.bubble = BUBBLES.done;
          char.bubbleTimer = 3000;
        } else if (latest.type === 'task_assigned') {
          char.bubble = BUBBLES.thinking;
          char.bubbleTimer = 2000;
        }
      }
    }
  }, [events]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resize();
    const resizeObs = new ResizeObserver(resize);
    resizeObs.observe(container);

    lastTimeRef.current = performance.now();

    const loop = (time: number) => {
      const state = stateRef.current;
      if (!state) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const dt = Math.min(time - lastTimeRef.current, 100);
      lastTimeRef.current = time;

      updateState(state, dt);
      renderOffice(ctx, state, canvas.width, canvas.height, scaleRef.current);

      // Update labels for React overlay
      const newLabels: typeof labels = [];
      for (const char of Array.from(state.chars.values())) {
        const pos = getCharScreenPos(char, state, canvas.width, canvas.height, scaleRef.current);
        newLabels.push({
          id: char.id,
          name: char.name,
          emoji: char.emoji,
          x: pos.x,
          y: pos.y,
          status: char.status,
          taskName: char.taskName,
          isSubAgent: char.isSubAgent,
        });
      }
      setLabels(newLabels);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObs.disconnect();
    };
  }, []);

  // Click handler
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const state = stateRef.current;
    const canvas = canvasRef.current;
    if (!state || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scale = scaleRef.current;

    let clicked: string | null = null;
    for (const char of Array.from(state.chars.values())) {
      const pos = getCharScreenPos(char, state, canvas.width, canvas.height, scale);
      const hw = 8 * scale;
      const hh = 12 * scale;
      if (mx >= pos.x - hw && mx <= pos.x + hw && my >= pos.y && my <= pos.y + 24 * scale) {
        clicked = char.id;
        break;
      }
    }

    state.selectedId = clicked;
    setSelectedAgent(clicked);
    if (clicked) {
      const agent = agents.find(a => a.id === clicked);
      if (agent) storeSelectAgent(agent);
    }
  }, [agents, storeSelectAgent]);

  // Zoom controls
  const handleZoom = useCallback((dir: 1 | -1) => {
    scaleRef.current = Math.max(1, Math.min(6, scaleRef.current + dir));
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[#12121e] overflow-hidden rounded-lg border border-[var(--mc-border)]">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="w-full h-full cursor-pointer"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Agent name labels (HTML overlay) */}
      {labels.map(l => (
        <div
          key={l.id}
          className="absolute pointer-events-none select-none flex flex-col items-center gap-0.5"
          style={{
            left: l.x,
            top: l.y - 28,
            transform: 'translateX(-50%)',
          }}
        >
          {/* Task name */}
          {l.taskName && l.status === 'working' && (
            <span className="text-[9px] text-mc-accent-cyan/70 truncate max-w-[100px] text-center">
              {l.taskName}
            </span>
          )}
          {/* Agent name */}
          <span
            className={`text-[10px] font-mono font-bold px-1 rounded whitespace-nowrap ${
              selectedAgent === l.id
                ? 'text-blue-400 bg-blue-900/50'
                : l.status === 'working'
                  ? 'text-green-400'
                  : l.status === 'offline'
                    ? 'text-red-400/50'
                    : 'text-gray-400'
            } ${l.isSubAgent ? 'italic text-[9px]' : ''}`}
          >
            {/* Status dot */}
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
              l.status === 'working' ? 'bg-green-500 animate-pulse' :
              l.status === 'standby' ? 'bg-yellow-500' :
              'bg-red-500'
            }`} />
            {l.emoji} {l.name}
          </span>
        </div>
      ))}

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex gap-1">
        <button
          onClick={() => handleZoom(-1)}
          className="w-7 h-7 bg-[var(--mc-bg-secondary)] border border-[var(--mc-border)] rounded text-xs text-[var(--mc-text)] hover:bg-[var(--mc-bg-tertiary)] transition"
        >
          −
        </button>
        <button
          onClick={() => handleZoom(1)}
          className="w-7 h-7 bg-[var(--mc-bg-secondary)] border border-[var(--mc-border)] rounded text-xs text-[var(--mc-text)] hover:bg-[var(--mc-bg-tertiary)] transition"
        >
          +
        </button>
      </div>

      {/* Legend */}
      <div className="absolute top-3 left-3 flex gap-3 text-[10px] font-mono text-gray-500">
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Working</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1" />Standby</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Offline</span>
      </div>

      {/* Selected agent info panel */}
      {selectedAgent && (() => {
        const char = stateRef.current?.chars.get(selectedAgent);
        if (!char) return null;
        return (
          <div className="absolute bottom-3 left-3 bg-[var(--mc-bg-secondary)]/90 backdrop-blur border border-[var(--mc-border)] rounded-lg p-3 max-w-[240px]">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{char.emoji}</span>
              <span className="font-mono font-bold text-sm text-[var(--mc-text)]">{char.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                char.status === 'working' ? 'bg-green-900/50 text-green-400' :
                char.status === 'standby' ? 'bg-yellow-900/50 text-yellow-400' :
                'bg-red-900/50 text-red-400'
              }`}>
                {char.status}
              </span>
            </div>
            {char.taskName && (
              <p className="text-xs text-mc-accent-cyan font-mono truncate">
                📋 {char.taskName}
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
