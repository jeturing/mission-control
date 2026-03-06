'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMissionControl } from '@/lib/store';
import type { Agent, Task, Event, TaskActivity } from '@/lib/types';
import {
  Monitor, Cpu, Clock, Zap, MessageSquare, X, ChevronRight,
  Terminal, Brain, Wrench, AlertCircle, CheckCircle2, Loader2,
  ArrowLeft, Maximize2, Minimize2, RefreshCw,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────
interface AgentMonitorData {
  agent: Agent;
  tasks: Task[];
  activeTasks: Task[];
  completedCount: number;
  recentEvents: Event[];
  uptime: string;
  lastActivity: string;
  thoughts: ThoughtEntry[];
  toolCalls: ToolCallEntry[];
}

interface ThoughtEntry {
  id: string;
  content: string;
  timestamp: string;
  type: 'thinking' | 'reasoning' | 'planning';
}

interface ToolCallEntry {
  id: string;
  name: string;
  args: string;
  result: string;
  timestamp: string;
  status: 'running' | 'success' | 'error';
}

type DetailTab = 'overview' | 'logs' | 'thoughts' | 'tools';

// ── Helpers ────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function estimateUptime(agent: Agent): string {
  if (agent.status === 'offline') return 'offline';
  const diff = Date.now() - new Date(agent.updated_at).getTime();
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ── Scanlines animation CSS (injected once) ────────────
const SCANLINE_STYLE = `
@keyframes monitor-scanline {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(400%); }
}
@keyframes monitor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
@keyframes monitor-type {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
@keyframes monitor-pulse-border {
  0%, 100% { border-color: var(--mc-accent-green); box-shadow: 0 0 8px rgba(63, 185, 80, 0.3); }
  50% { border-color: rgba(63, 185, 80, 0.5); box-shadow: 0 0 4px rgba(63, 185, 80, 0.15); }
}
`;

// ── Monitor Screen Component (single agent) ───────────
function MonitorScreen({
  data,
  isSelected,
  onClick,
  compact,
}: {
  data: AgentMonitorData;
  isSelected: boolean;
  onClick: () => void;
  compact: boolean;
}) {
  const { agent, activeTasks, completedCount, recentEvents, uptime } = data;
  const isWorking = agent.status === 'working';
  const isStandby = agent.status === 'standby';

  return (
    <button
      onClick={onClick}
      className={`
        relative group text-left w-full rounded-lg border-2 transition-all duration-300
        ${isSelected ? 'border-[var(--mc-accent)] shadow-[0_0_12px_rgba(88,166,255,0.4)] scale-[1.02]' : ''}
        ${isWorking
          ? 'border-[var(--mc-accent-green)]/60 bg-gradient-to-b from-[#0a1a0f] to-[#0d1117]'
          : isStandby
            ? 'border-[var(--mc-accent-yellow)]/40 bg-gradient-to-b from-[#1a170a] to-[#0d1117]'
            : 'border-[var(--mc-border)] bg-gradient-to-b from-[#1a0a0a] to-[#0d1117]'
        }
        hover:border-[var(--mc-accent)]/60 hover:shadow-[0_0_8px_rgba(88,166,255,0.2)]
        overflow-hidden
      `}
    >
      {/* CRT scanline overlay */}
      {isWorking && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
          <div
            className="absolute left-0 right-0 h-[2px] bg-white/5"
            style={{ animation: 'monitor-scanline 3s linear infinite' }}
          />
        </div>
      )}

      {/* Screen content */}
      <div className={`p-3 ${compact ? 'space-y-2' : 'space-y-3'}`}>
        {/* Header: Agent info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg flex-shrink-0">{agent.avatar_emoji}</span>
            <div className="min-w-0">
              <div className="font-mono font-bold text-sm text-[var(--mc-text)] truncate">
                {agent.name}
              </div>
              <div className="text-[10px] text-[var(--mc-text-secondary)] truncate">
                {agent.role}
              </div>
            </div>
          </div>
          {/* Status indicator */}
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono ${
            isWorking
              ? 'bg-green-900/40 text-green-400'
              : isStandby
                ? 'bg-yellow-900/40 text-yellow-400'
                : 'bg-red-900/40 text-red-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              isWorking ? 'bg-green-500 animate-pulse' : isStandby ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            {agent.status}
          </div>
        </div>

        {/* Terminal-style output area */}
        <div className="bg-black/40 rounded border border-[var(--mc-border)]/50 p-2 min-h-[60px] max-h-[80px] overflow-hidden font-mono text-[10px]">
          {isWorking && activeTasks.length > 0 ? (
            <div className="space-y-0.5">
              <div className="text-green-400">
                <span className="text-green-600">$</span> running task...
              </div>
              <div className="text-[var(--mc-accent-cyan)] truncate">
                → {activeTasks[0].title}
              </div>
              {activeTasks[0].status && (
                <div className="text-[var(--mc-text-secondary)]">
                  stage: <span className="text-[var(--mc-accent)]">{activeTasks[0].status}</span>
                </div>
              )}
              <div className="text-green-400/60 inline-flex items-center gap-1">
                <span className="inline-block w-1.5 h-3 bg-green-400/80" style={{ animation: 'monitor-type 1s step-end infinite' }} />
              </div>
            </div>
          ) : isStandby ? (
            <div className="space-y-0.5">
              <div className="text-yellow-400/70">
                <span className="text-yellow-600">$</span> idle — awaiting assignment
              </div>
              {recentEvents.length > 0 && (
                <div className="text-[var(--mc-text-secondary)] truncate">
                  last: {recentEvents[0].message}
                </div>
              )}
            </div>
          ) : (
            <div className="text-red-400/60">
              <span className="text-red-600">$</span> connection lost
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div className="flex items-center justify-between text-[10px] font-mono text-[var(--mc-text-secondary)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              {activeTasks.length} active
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              {completedCount} done
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {uptime}
          </span>
        </div>

        {/* Model badge */}
        {agent.model && (
          <div className="flex items-center gap-1 text-[9px] font-mono text-[var(--mc-accent)]/60 truncate">
            <Zap className="w-2.5 h-2.5 flex-shrink-0" />
            {agent.model}
          </div>
        )}
      </div>

      {/* Click hint */}
      <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-4 h-4 text-[var(--mc-accent)]/50" />
      </div>
    </button>
  );
}

// ── Detail Panel Component (expanded agent view) ───────
function AgentDetailPanel({
  data,
  activities,
  onClose,
  onRefresh,
}: {
  data: AgentMonitorData;
  activities: TaskActivity[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const { agent, activeTasks, completedCount, recentEvents, uptime, thoughts, toolCalls } = data;
  const isWorking = agent.status === 'working';

  const tabs: { id: DetailTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <Monitor className="w-3.5 h-3.5" /> },
    { id: 'logs', label: 'Logs', icon: <Terminal className="w-3.5 h-3.5" />, count: activities.length },
    { id: 'thoughts', label: 'Thoughts', icon: <Brain className="w-3.5 h-3.5" />, count: thoughts.length },
    { id: 'tools', label: 'Tools', icon: <Wrench className="w-3.5 h-3.5" />, count: toolCalls.length },
  ];

  return (
    <div className="h-full flex flex-col bg-[var(--mc-bg)] border-l border-[var(--mc-border)] overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--mc-border)] bg-[var(--mc-bg-secondary)]">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onClose} className="text-[var(--mc-text-secondary)] hover:text-[var(--mc-text)] transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-lg">{agent.avatar_emoji}</span>
          <div className="min-w-0">
            <div className="font-mono font-bold text-sm truncate">{agent.name}</div>
            <div className="text-[10px] text-[var(--mc-text-secondary)]">{agent.role}</div>
          </div>
          <div className={`ml-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono ${
            isWorking ? 'bg-green-900/40 text-green-400' : agent.status === 'standby' ? 'bg-yellow-900/40 text-yellow-400' : 'bg-red-900/40 text-red-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isWorking ? 'bg-green-500 animate-pulse' : agent.status === 'standby' ? 'bg-yellow-500' : 'bg-red-500'}`} />
            {agent.status}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onRefresh} className="p-1.5 text-[var(--mc-text-secondary)] hover:text-[var(--mc-text)] transition rounded hover:bg-[var(--mc-bg-tertiary)]">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1.5 text-[var(--mc-text-secondary)] hover:text-[var(--mc-text)] transition rounded hover:bg-[var(--mc-bg-tertiary)]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--mc-border)] bg-[var(--mc-bg-secondary)]/50 px-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono border-b-2 transition ${
              tab === t.id
                ? 'border-[var(--mc-accent)] text-[var(--mc-accent)]'
                : 'border-transparent text-[var(--mc-text-secondary)] hover:text-[var(--mc-text)]'
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1 px-1 py-0.5 text-[9px] bg-[var(--mc-bg-tertiary)] rounded">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === 'overview' && (
          <OverviewTab data={data} />
        )}
        {tab === 'logs' && (
          <LogsTab activities={activities} events={recentEvents} />
        )}
        {tab === 'thoughts' && (
          <ThoughtsTab thoughts={thoughts} isWorking={isWorking} />
        )}
        {tab === 'tools' && (
          <ToolsTab toolCalls={toolCalls} />
        )}
      </div>
    </div>
  );
}

// ── Tab Content Components ─────────────────────────────
function OverviewTab({ data }: { data: AgentMonitorData }) {
  const { agent, activeTasks, completedCount, uptime } = data;

  return (
    <div className="space-y-3">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Active Tasks" value={String(activeTasks.length)} icon={<Cpu className="w-4 h-4" />} color="blue" />
        <StatCard label="Completed" value={String(completedCount)} icon={<CheckCircle2 className="w-4 h-4" />} color="green" />
        <StatCard label="Uptime" value={uptime} icon={<Clock className="w-4 h-4" />} color="yellow" />
        <StatCard label="Model" value={agent.model || 'default'} icon={<Zap className="w-4 h-4" />} color="purple" />
      </div>

      {/* Active tasks list */}
      {activeTasks.length > 0 && (
        <div className="bg-[var(--mc-bg-secondary)] border border-[var(--mc-border)] rounded-lg p-3">
          <h3 className="text-xs font-mono font-bold text-[var(--mc-text)] mb-2 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-green-400" />
            Active Tasks
          </h3>
          <div className="space-y-2">
            {activeTasks.map(task => (
              <div key={task.id} className="flex items-center gap-2 p-2 bg-black/30 rounded border border-[var(--mc-border)]/50">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  task.status === 'in_progress' ? 'bg-green-500 animate-pulse' :
                  task.status === 'testing' ? 'bg-blue-500 animate-pulse' :
                  task.status === 'review' ? 'bg-purple-500' : 'bg-yellow-500'
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-mono text-[var(--mc-text)] truncate">{task.title}</div>
                  <div className="text-[9px] text-[var(--mc-text-secondary)]">
                    {task.status.replace(/_/g, ' ')} · {task.priority}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent metadata */}
      <div className="bg-[var(--mc-bg-secondary)] border border-[var(--mc-border)] rounded-lg p-3">
        <h3 className="text-xs font-mono font-bold text-[var(--mc-text)] mb-2">System Info</h3>
        <div className="space-y-1 text-[10px] font-mono">
          <div className="flex justify-between">
            <span className="text-[var(--mc-text-secondary)]">ID</span>
            <span className="text-[var(--mc-text)] truncate ml-2 max-w-[180px]">{agent.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--mc-text-secondary)]">Source</span>
            <span className="text-[var(--mc-text)]">{agent.source}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--mc-text-secondary)]">Created</span>
            <span className="text-[var(--mc-text)]">{relativeTime(agent.created_at)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--mc-text-secondary)]">Updated</span>
            <span className="text-[var(--mc-text)]">{relativeTime(agent.updated_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogsTab({ activities, events }: { activities: TaskActivity[]; events: Event[] }) {
  const allEntries = [
    ...activities.map(a => ({
      id: a.id,
      time: a.created_at,
      message: a.message,
      type: a.activity_type as string,
      agent: a.agent?.name,
    })),
    ...events.map(e => ({
      id: e.id,
      time: e.created_at,
      message: e.message,
      type: e.type,
      agent: e.agent?.name,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <div className="space-y-1">
      {allEntries.length === 0 ? (
        <div className="text-center py-8 text-[var(--mc-text-secondary)] text-xs font-mono">
          No activity logs
        </div>
      ) : (
        allEntries.map(entry => (
          <div key={entry.id} className="flex gap-2 p-2 bg-black/20 rounded border border-[var(--mc-border)]/30 font-mono text-[10px]">
            <span className="text-[var(--mc-text-secondary)] flex-shrink-0 w-12">{relativeTime(entry.time)}</span>
            <span className={`flex-shrink-0 px-1 rounded ${
              entry.type === 'completed' || entry.type === 'task_completed' ? 'bg-green-900/30 text-green-400' :
              entry.type === 'spawned' || entry.type === 'agent_spawned' ? 'bg-blue-900/30 text-blue-400' :
              entry.type === 'status_changed' ? 'bg-yellow-900/30 text-yellow-400' :
              'bg-[var(--mc-bg-tertiary)] text-[var(--mc-text-secondary)]'
            }`}>
              {entry.type}
            </span>
            <span className="text-[var(--mc-text)] truncate flex-1">{entry.message}</span>
          </div>
        ))
      )}
    </div>
  );
}

function ThoughtsTab({ thoughts, isWorking }: { thoughts: ThoughtEntry[]; isWorking: boolean }) {
  return (
    <div className="space-y-2">
      {isWorking && (
        <div className="flex items-center gap-2 p-2 bg-green-900/20 border border-green-800/30 rounded text-[10px] font-mono text-green-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Agent is actively thinking...
        </div>
      )}
      {thoughts.length === 0 ? (
        <div className="text-center py-8 text-[var(--mc-text-secondary)] text-xs font-mono">
          <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No recorded thoughts yet.
          <br />
          <span className="text-[10px]">Thoughts appear when the agent processes tasks.</span>
        </div>
      ) : (
        thoughts.map(t => (
          <div key={t.id} className="p-2 bg-[var(--mc-bg-secondary)] border border-[var(--mc-border)] rounded">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[9px] px-1 rounded font-mono ${
                t.type === 'thinking' ? 'bg-blue-900/30 text-blue-400' :
                t.type === 'reasoning' ? 'bg-purple-900/30 text-purple-400' :
                'bg-yellow-900/30 text-yellow-400'
              }`}>
                {t.type}
              </span>
              <span className="text-[9px] text-[var(--mc-text-secondary)] font-mono">{relativeTime(t.timestamp)}</span>
            </div>
            <p className="text-[11px] text-[var(--mc-text)] font-mono whitespace-pre-wrap">{t.content}</p>
          </div>
        ))
      )}
    </div>
  );
}

function ToolsTab({ toolCalls }: { toolCalls: ToolCallEntry[] }) {
  return (
    <div className="space-y-2">
      {toolCalls.length === 0 ? (
        <div className="text-center py-8 text-[var(--mc-text-secondary)] text-xs font-mono">
          <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No tool calls recorded.
          <br />
          <span className="text-[10px]">Tool invocations appear when the agent uses external tools.</span>
        </div>
      ) : (
        toolCalls.map(tc => (
          <div key={tc.id} className="p-2 bg-[var(--mc-bg-secondary)] border border-[var(--mc-border)] rounded">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Wrench className="w-3 h-3 text-[var(--mc-accent)]" />
                <span className="text-[11px] font-mono font-bold text-[var(--mc-text)]">{tc.name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {tc.status === 'running' && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                {tc.status === 'success' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                {tc.status === 'error' && <AlertCircle className="w-3 h-3 text-red-400" />}
                <span className="text-[9px] text-[var(--mc-text-secondary)] font-mono">{relativeTime(tc.timestamp)}</span>
              </div>
            </div>
            {tc.args && (
              <div className="mt-1 p-1.5 bg-black/30 rounded text-[9px] font-mono text-[var(--mc-text-secondary)] truncate">
                args: {tc.args}
              </div>
            )}
            {tc.result && (
              <div className={`mt-1 p-1.5 rounded text-[9px] font-mono truncate ${
                tc.status === 'error' ? 'bg-red-900/20 text-red-400' : 'bg-green-900/20 text-green-400'
              }`}>
                → {tc.result}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-900/20',
    green: 'text-green-400 bg-green-900/20',
    yellow: 'text-yellow-400 bg-yellow-900/20',
    purple: 'text-purple-400 bg-purple-900/20',
    red: 'text-red-400 bg-red-900/20',
  };

  return (
    <div className="bg-[var(--mc-bg-secondary)] border border-[var(--mc-border)] rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`${colorMap[color]} p-1 rounded`}>{icon}</span>
        <span className="text-[10px] text-[var(--mc-text-secondary)] font-mono">{label}</span>
      </div>
      <div className="text-sm font-mono font-bold text-[var(--mc-text)] truncate">{value}</div>
    </div>
  );
}

// ── Main MonitorGrid Component ─────────────────────────
export default function MonitorGrid() {
  const agents = useMissionControl(s => s.agents);
  const tasks = useMissionControl(s => s.tasks);
  const events = useMissionControl(s => s.events);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [compact, setCompact] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimer = useRef<NodeJS.Timeout>();

  // Build monitor data for each agent
  const monitorData: AgentMonitorData[] = agents.map(agent => {
    const agentTasks = tasks.filter(t => t.assigned_agent_id === agent.id);
    const activeTasks = agentTasks.filter(t => t.status !== 'done');
    const completedCount = agentTasks.filter(t => t.status === 'done').length;
    const agentEvents = events.filter(e => e.agent_id === agent.id);

    // Build synthetic thoughts from recent events and activities
    const thoughts: ThoughtEntry[] = agentEvents
      .filter(e => e.type === 'task_status_changed' || e.type === 'task_assigned')
      .slice(0, 10)
      .map(e => ({
        id: e.id,
        content: e.message,
        timestamp: e.created_at,
        type: e.type === 'task_assigned' ? 'planning' as const : 'reasoning' as const,
      }));

    // Build synthetic tool calls from task activities
    const toolCalls: ToolCallEntry[] = activities
      .filter(a => a.agent_id === agent.id && a.activity_type === 'file_created')
      .map(a => ({
        id: a.id,
        name: 'file_create',
        args: a.metadata || '',
        result: a.message,
        timestamp: a.created_at,
        status: 'success' as const,
      }));

    return {
      agent,
      tasks: agentTasks,
      activeTasks,
      completedCount,
      recentEvents: agentEvents.slice(0, 5),
      uptime: estimateUptime(agent),
      lastActivity: agentEvents[0]?.created_at || agent.updated_at,
      thoughts,
      toolCalls,
    };
  });

  // Sort: working first, then standby, then offline
  const sortedData = [...monitorData].sort((a, b) => {
    const order: Record<string, number> = { working: 0, standby: 1, offline: 2 };
    return (order[a.agent.status] ?? 3) - (order[b.agent.status] ?? 3);
  });

  const selectedData = selectedAgentId ? monitorData.find(d => d.agent.id === selectedAgentId) : null;

  // Fetch activities when an agent is selected
  const fetchActivities = useCallback(async (agentId: string) => {
    try {
      setIsRefreshing(true);
      // Get activities for tasks assigned to this agent
      const agentTasks = tasks.filter(t => t.assigned_agent_id === agentId);
      const allActivities: TaskActivity[] = [];

      for (const task of agentTasks.slice(0, 5)) {
        try {
          const res = await fetch(`/api/tasks/${task.id}/activities`);
          if (res.ok) {
            const data = await res.json();
            allActivities.push(...data);
          }
        } catch {
          // Skip failed fetches
        }
      }

      setActivities(allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } finally {
      setIsRefreshing(false);
    }
  }, [tasks]);

  // Load activities on selection
  useEffect(() => {
    if (selectedAgentId) {
      fetchActivities(selectedAgentId);
    } else {
      setActivities([]);
    }
  }, [selectedAgentId, fetchActivities]);

  // Auto-refresh every 15s when an agent is selected
  useEffect(() => {
    if (!selectedAgentId) return;
    refreshTimer.current = setInterval(() => {
      fetchActivities(selectedAgentId);
    }, 15000);
    return () => clearInterval(refreshTimer.current);
  }, [selectedAgentId, fetchActivities]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: SCANLINE_STYLE }} />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--mc-border)] bg-[var(--mc-bg-secondary)]/50">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-[var(--mc-accent)]" />
          <span className="text-xs font-mono font-bold text-[var(--mc-text)]">
            Agent Monitor
          </span>
          <span className="px-1.5 py-0.5 text-[9px] font-mono bg-[var(--mc-bg-tertiary)] text-[var(--mc-text-secondary)] rounded">
            {agents.length} agents
          </span>
          {/* Live status counts */}
          <div className="flex items-center gap-2 ml-2 text-[9px] font-mono">
            <span className="flex items-center gap-1 text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {agents.filter(a => a.status === 'working').length}
            </span>
            <span className="flex items-center gap-1 text-yellow-400">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              {agents.filter(a => a.status === 'standby').length}
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {agents.filter(a => a.status === 'offline').length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCompact(!compact)}
            className="p-1.5 text-[var(--mc-text-secondary)] hover:text-[var(--mc-text)] transition rounded hover:bg-[var(--mc-bg-tertiary)]"
            title={compact ? 'Expand' : 'Compact'}
          >
            {compact ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Grid area */}
        <div className={`flex-1 overflow-y-auto p-3 ${selectedAgentId ? '' : ''}`}>
          {agents.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Monitor className="w-12 h-12 mx-auto mb-3 text-[var(--mc-text-secondary)] opacity-30" />
                <p className="text-sm font-mono text-[var(--mc-text-secondary)]">No agents registered</p>
                <p className="text-[10px] font-mono text-[var(--mc-text-secondary)]/60 mt-1">
                  Import agents from OpenClaw Gateway to start monitoring
                </p>
              </div>
            </div>
          ) : (
            <div className={`grid gap-3 ${
              compact
                ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : selectedAgentId
                  ? 'grid-cols-1 lg:grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            }`}>
              {sortedData.map(data => (
                <MonitorScreen
                  key={data.agent.id}
                  data={data}
                  isSelected={selectedAgentId === data.agent.id}
                  onClick={() => setSelectedAgentId(
                    selectedAgentId === data.agent.id ? null : data.agent.id
                  )}
                  compact={compact}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedData && (
          <div className="w-80 xl:w-96 flex-shrink-0">
            <AgentDetailPanel
              data={selectedData}
              activities={activities}
              onClose={() => setSelectedAgentId(null)}
              onRefresh={() => selectedAgentId && fetchActivities(selectedAgentId)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
