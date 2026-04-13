"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CircleDotDashed } from "lucide-react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

export type AgentPlanStatus =
  | "pending"
  | "in-progress"
  | "completed"
  | "need-help"
  | "failed";

export interface AgentPlanTask {
  id: string;
  title: string;
  description?: string;
  status: AgentPlanStatus | string;
  priority?: string;
  type?: string;
  target?: string;
  dependencies?: string[];
  tools?: string[];
  order?: number;
  plannedAt?: number;
  startedAt?: number;
  completedAt?: number;
  updatedAt?: number;
  visibleAfterMs?: number;
  source?: string;
}

interface AgentPlanProps {
  tasks: AgentPlanTask[];
  className?: string;
}

function toInt(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.round(ms / 1000))}s`;
}

function getDisplayStatusLabel(
  task: AgentPlanTask,
  unfinishedIndex: number,
  index: number,
  now: number,
) {
  if (task.status === "completed") {
    const startedAt = toInt(task.startedAt) ?? toInt(task.plannedAt) ?? now;
    const completedAt = toInt(task.completedAt) ?? now;
    return formatSeconds(Math.max(0, completedAt - startedAt));
  }

  if (task.status === "in-progress") {
    const startedAt = toInt(task.startedAt) ?? toInt(task.plannedAt) ?? now;
    return formatSeconds(Math.max(0, now - startedAt));
  }

  if (task.status === "failed") {
    return "Failed";
  }

  if (task.status === "need-help") {
    return "Needs help";
  }

  if (unfinishedIndex < 0 || index < unfinishedIndex) {
    return "Pending";
  }

  if (index === unfinishedIndex) {
    return "Pending";
  }

  if (index === unfinishedIndex + 1) {
    return "Queued";
  }

  return "Not started";
}

export default function AgentPlan({ tasks, className }: AgentPlanProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const orderedTasks = useMemo(() => {
    return [...tasks].sort((left, right) => {
      const leftOrder = toInt(left.order) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = toInt(right.order) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      const leftUpdated = toInt(left.updatedAt) ?? toInt(left.plannedAt) ?? 0;
      const rightUpdated = toInt(right.updatedAt) ?? toInt(right.plannedAt) ?? 0;
      return leftUpdated - rightUpdated;
    });
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    return orderedTasks.filter((task) => {
      const plannedAt = toInt(task.plannedAt) ?? now;
      const visibleAfterMs = Math.max(0, toInt(task.visibleAfterMs) ?? 0);
      return now - plannedAt >= visibleAfterMs;
    });
  }, [now, orderedTasks]);

  const percentComplete = useMemo(() => {
    if (visibleTasks.length === 0) return 0;
    const completedCount = visibleTasks.filter((task) => task.status === "completed").length;
    if (completedCount >= visibleTasks.length) return 100;
    return Math.max(0, Math.min(99, Math.floor((completedCount / visibleTasks.length) * 100)));
  }, [visibleTasks]);

  const activeTask = useMemo(() => {
    const inProgress = orderedTasks.find((task) => task.status === "in-progress");
    if (inProgress) return inProgress;
    const nextPending = orderedTasks.find((task) => task.status !== "completed");
    if (nextPending) return nextPending;
    return orderedTasks[orderedTasks.length - 1] ?? null;
  }, [orderedTasks]);

  const unfinishedIndex = visibleTasks.findIndex((task) => task.status !== "completed");

  if (visibleTasks.length === 0 || !activeTask) return null;

  return (
    <div className={cn("px-2 py-1.5", className)}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.2, 0.65, 0.3, 0.9] }}
      >
        <div className="flex items-center gap-3">
          <span className="relative flex size-5 shrink-0 items-center justify-center">
            {percentComplete >= 100 ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-300">
                <Check className="size-3.5" />
              </span>
            ) : (
              <>
                <motion.span
                  className="absolute inset-0 rounded-full border border-white/10"
                  animate={{ opacity: [0.85, 0.55, 0.85] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.span
                  className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#a36bff] border-l-[#7a6cff]"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
                />
                <CircleDotDashed className="size-3.5 text-white/0" />
              </>
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.01em] text-white/92">
            {activeTask.title}
          </span>
          <span className="shrink-0 text-[15px] font-medium text-white/66">
            {percentComplete}%
          </span>
        </div>

        <ul className="mt-3 flex w-full flex-col gap-2">
          {visibleTasks.map((task, index) => {
            const isCompleted = task.status === "completed";
            const isActive = task.status === "in-progress";
            const rightLabel = getDisplayStatusLabel(task, unfinishedIndex, index, now);

            return (
              <li
                key={task.id}
                className="flex w-full min-w-0 items-center gap-3 text-[13px] leading-5"
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {isCompleted ? (
                    <Check className="size-3.5 text-white/84" strokeWidth={2.2} />
                  ) : (
                    <span className="size-3.5" />
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate pr-2",
                    isCompleted
                      ? "text-white/82"
                      : isActive
                        ? "text-white/92"
                        : task.status === "failed"
                          ? "text-rose-300"
                          : "text-white/48",
                  )}
                >
                  {task.title}
                </span>
                <span
                  className={cn(
                    "w-[74px] shrink-0 text-right font-medium tabular-nums text-[13px]",
                    isCompleted
                      ? "text-white/62"
                      : isActive
                        ? "text-white/62"
                        : task.status === "failed"
                          ? "text-rose-300/90"
                          : "text-white/46",
                  )}
                >
                  {rightLabel}
                </span>
              </li>
            );
          })}
        </ul>
      </motion.div>
    </div>
  );
}
