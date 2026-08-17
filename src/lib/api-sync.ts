import { useEffect } from "react";
import { create } from "zustand";
import { useBoard } from "./store";
import { useRemarks } from "./remarks";
import type { List, Task } from "./types";

type ConnectionStatus = "connecting" | "connected" | "local";

interface ConnectionState {
  status: ConnectionStatus;
  revision: number | null;
  error: string | null;
}

interface RemoteBoard {
  initialized: boolean;
  revision: number;
  lists: Record<string, List>;
  tasks: Record<string, Task>;
}

export const useApiConnection = create<ConnectionState>(() => ({
  status: "connecting",
  revision: null,
  error: null,
}));

const apiBase = import.meta.env.DEV ? "http://127.0.0.1:8787" : "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `ScheduGrr API returned ${response.status}`);
    return data;
  } finally {
    window.clearTimeout(timeout);
  }
}

function setConnection(status: ConnectionStatus, revision: number | null, error: string | null = null) {
  useApiConnection.setState({ status, revision, error });
}

/**
 * Link the browser store to the optional loopback API.
 *
 * The browser remains fully local-first: if the API is absent, Zustand keeps
 * using localStorage. When `npm run dev` or `npm start` provides the API, the
 * same board is also saved to a local JSON file and external edits are pulled
 * into the open UI. This is the bridge used by coding agents and LLM tools.
 */
export function useScheduGrrApiSync() {
  useEffect(() => {
    if (import.meta.env.MODE === "test") {
      setConnection("local", null);
      return;
    }

    let active = true;
    let applyingRemote = false;
    let pushing = false;
    let revision: number | null = null;
    let pushTimer: number | null = null;
    let pollTimer: number | null = null;
    let unsubscribe: (() => void) | null = null;

    const apply = (remote: RemoteBoard, announceCompletions = false) => {
      const localTasks = useBoard.getState().tasks;
      const newlyCompleted = announceCompletions
        ? Object.values(remote.tasks).filter((task) => task.completed && localTasks[task.id] && !localTasks[task.id].completed)
        : [];
      applyingRemote = true;
      useBoard.getState().replaceDocument({ lists: remote.lists, tasks: remote.tasks });
      applyingRemote = false;
      for (const task of newlyCompleted) {
        useRemarks.getState().show(task.title || "Untitled task");
      }
      revision = remote.revision;
      setConnection("connected", revision);
    };

    const push = async () => {
      if (!active || applyingRemote || pushing) return;
      pushing = true;
      const { lists, tasks } = useBoard.getState();
      try {
        const remote = await request<RemoteBoard>("/api/board", {
          method: "PUT",
          body: JSON.stringify({ lists, tasks }),
        });
        if (!active) return;
        revision = remote.revision;
        setConnection("connected", revision);
      } catch (error) {
        if (!active) return;
        setConnection("local", revision, error instanceof Error ? error.message : "API unavailable");
      } finally {
        pushing = false;
      }
    };

    const schedulePush = () => {
      if (!active || applyingRemote) return;
      if (pushTimer !== null) window.clearTimeout(pushTimer);
      pushTimer = window.setTimeout(() => {
        pushTimer = null;
        void push();
      }, 120);
    };

    const poll = async () => {
      if (!active || pushing || pushTimer !== null) return;
      try {
        const remote = await request<RemoteBoard>("/api/board");
        if (!active) return;
        if (remote.initialized && remote.revision !== revision) apply(remote, true);
        else setConnection("connected", remote.revision);
      } catch (error) {
        if (!active) return;
        setConnection("local", revision, error instanceof Error ? error.message : "API unavailable");
      }
    };

    const start = async () => {
      setConnection("connecting", null);
      try {
        const remote = await request<RemoteBoard>("/api/board");
        if (!active) return;
        if (remote.initialized) apply(remote);
        else await push();
        if (!active) return;
        unsubscribe = useBoard.subscribe(schedulePush);
        pollTimer = window.setInterval(() => void poll(), 1_500);
      } catch (error) {
        if (!active) return;
        setConnection("local", null, error instanceof Error ? error.message : "API unavailable");
      }
    };

    void start();

    return () => {
      active = false;
      unsubscribe?.();
      if (pushTimer !== null) window.clearTimeout(pushTimer);
      if (pollTimer !== null) window.clearInterval(pollTimer);
    };
  }, []);
}

/** Compatibility alias for integrations compiled against the previous name. */
export const useOpenAgendaApiSync = useScheduGrrApiSync;
