import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoard } from "./store";
import { useApiConnection, useScheduGrrApiSync } from "./api-sync";

class Events {
  static instances: Events[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(_url: string) { Events.instances.push(this); }
  close() { this.closed = true; }
  emit(revision: number) { this.onmessage?.({ data: String(revision) }); }
}
function snapshot(revision = 1) {
  const { lists, tasks } = useBoard.getState();
  return { initialized: true, revision, ...structuredClone({ lists, tasks }) };
}
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  useBoard.getState().resetToSeed();
  useApiConnection.setState({ status: "connecting", revision: null, error: null });
  Events.instances = [];
  vi.stubEnv("MODE", "production");
  vi.stubGlobal("EventSource", Events);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("local API revision notifications", () => {
  it("does not repeatedly download an unchanged board and closes its subscription", async () => {
    const remote = snapshot();
    const fetcher = vi.fn(async () => response(remote)); vi.stubGlobal("fetch", fetcher);
    const hook = renderHook(useScheduGrrApiSync);
    await waitFor(() => expect(Events.instances).toHaveLength(1));
    await act(async () => { Events.instances[0].emit(1); await new Promise(r => setTimeout(r, 1600)); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    hook.unmount(); expect(Events.instances[0].closed).toBe(true);
  });

  it("pulls externally edited tasks as soon as a newer revision arrives", async () => {
    let remote = snapshot(); vi.stubGlobal("fetch", vi.fn(async () => response(remote)));
    renderHook(useScheduGrrApiSync); await waitFor(() => expect(Events.instances).toHaveLength(1));
    const id = Object.keys(remote.tasks)[0]; remote = structuredClone(remote); remote.revision = 2; remote.tasks[id].title = "External edit";
    act(() => Events.instances[0].emit(2));
    await waitFor(() => expect(useBoard.getState().tasks[id].title).toBe("External edit"));
  });

  it("persists another local edit made during an in-flight write", async () => {
    let remote = snapshot(); let release: (() => void) | undefined; const writes: ReturnType<typeof snapshot>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as ReturnType<typeof snapshot>; writes.push(body);
        if (writes.length === 1) await new Promise<void>(r => { release = r; });
        remote = { ...body, initialized: true, revision: remote.revision + 1 };
      }
      return response(remote);
    }));
    renderHook(useScheduGrrApiSync); await waitFor(() => expect(Events.instances).toHaveLength(1));
    act(() => Events.instances[0].emit(1));
    const id = Object.keys(remote.tasks)[0];
    act(() => useBoard.getState().updateTask(id, { title: "First edit" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    act(() => useBoard.getState().updateTask(id, { title: "Second edit" }));
    await act(async () => release?.());
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1].tasks[id].title).toBe("Second edit");
  });

  it("does not miss a remote notification received while a write is in flight", async () => {
    let remote = snapshot(); let release: (() => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const own = { ...JSON.parse(String(init.body)), initialized: true, revision: 2 };
        await new Promise<void>(r => { release = r; }); return response(own);
      }
      return response(remote);
    }));
    renderHook(useScheduGrrApiSync); await waitFor(() => expect(Events.instances).toHaveLength(1));
    const id = Object.keys(remote.tasks)[0];
    act(() => useBoard.getState().updateTask(id, { title: "Local edit" }));
    await waitFor(() => expect(release).toBeDefined());
    remote = snapshot(3); remote.tasks[id].notes = "External notes";
    act(() => Events.instances[0].emit(3)); await act(async () => release?.());
    await waitFor(() => expect(useBoard.getState().tasks[id].notes).toBe("External notes"));
  });
});
