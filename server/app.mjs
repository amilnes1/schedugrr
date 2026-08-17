import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError } from "./board-store.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distRoot = resolve(projectRoot, "dist");
const openApiPath = resolve(projectRoot, "openapi.json");

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]") &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new ApiError(413, "Request body is too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
}

function taskSort(a, b) {
  if (a.date === b.date) {
    if (!a.date) return a.order - b.order;
    const byTime = (a.time ?? "99:99").localeCompare(b.time ?? "99:99");
    return byTime || a.dayOrder - b.dayOrder;
  }
  if (a.date === null) return 1;
  if (b.date === null) return -1;
  return a.date.localeCompare(b.date);
}

function listSort(a, b) {
  return a.order - b.order;
}

const PRIORITY_RANK = { none: 0, low: 1, medium: 2, high: 3 };

function listTaskSort(list) {
  return list.taskOrder === "manual"
    ? (a, b) => a.order - b.order
    : (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || a.order - b.order;
}

function match(segment, pathname) {
  const result = pathname.match(new RegExp(`^/api/${segment}/([^/]+)$`));
  return result ? decodeURIComponent(result[1]) : null;
}

async function apiRoute(req, res, url, store, { calendar = null } = {}) {
  const { pathname, searchParams } = url;

  if (req.method === "GET" && pathname === "/api/health") {
    const board = await store.read();
    return json(res, 200, {
      ok: true,
      app: "schedugrr",
      version: 1,
      initialized: board.initialized,
      revision: board.revision,
    });
  }

  if (req.method === "GET" && pathname === "/api/board") {
    return json(res, 200, await store.read());
  }

  if (req.method === "PUT" && pathname === "/api/board") {
    const result = await store.replace(await body(req));
    return json(res, 200, result.document);
  }

  if (req.method === "GET" && pathname === "/api/calendar/status") {
    return json(res, 200, calendar
      ? await calendar.getStatus()
      : {
          available: false,
          platform: process.platform,
          authorization: "unavailable",
          settings: { enabled: false, calendarId: null, includeUntimed: true, durationMinutes: 30 },
          lastSync: null,
        });
  }

  if (req.method === "POST" && pathname === "/api/calendar/access") {
    if (!calendar) throw new ApiError(501, "Native calendar sync is available in the macOS desktop app.");
    return json(res, 200, await calendar.requestAccess());
  }

  if (req.method === "GET" && pathname === "/api/calendar/calendars") {
    return json(res, 200, { calendars: calendar ? await calendar.listCalendars() : [] });
  }

  if (req.method === "PUT" && pathname === "/api/calendar/settings") {
    if (!calendar) throw new ApiError(501, "Native calendar sync is available in the macOS desktop app.");
    return json(res, 200, await calendar.updateSettings(await body(req)));
  }

  if (req.method === "POST" && pathname === "/api/calendar/sync") {
    if (!calendar) throw new ApiError(501, "Native calendar sync is available in the macOS desktop app.");
    return json(res, 200, { sync: await calendar.syncNow(), status: await calendar.getStatus() });
  }

  if (req.method === "GET" && pathname === "/api/lists") {
    const board = await store.read();
    return json(res, 200, { revision: board.revision, lists: Object.values(board.lists).sort(listSort) });
  }

  if (req.method === "POST" && pathname === "/api/lists") {
    const result = await store.createList(await body(req));
    return json(res, 201, { revision: result.document.revision, list: result.value });
  }

  const listId = match("lists", pathname);
  if (listId && req.method === "PATCH") {
    const result = await store.updateList(listId, await body(req));
    return json(res, 200, { revision: result.document.revision, list: result.value });
  }
  if (listId && req.method === "DELETE") {
    const result = await store.deleteList(listId);
    return json(res, 200, { revision: result.document.revision, ...result.value });
  }

  if (req.method === "GET" && pathname === "/api/tasks") {
    const board = await store.read();
    const query = searchParams.get("q")?.trim().toLowerCase();
    const status = searchParams.get("status");
    const date = searchParams.get("date");
    const listIdFilter = searchParams.get("listId");
    const listName = searchParams.get("listName")?.trim().toLowerCase();
    const namedListId = listName
      ? Object.values(board.lists).find((list) => list.name.toLowerCase() === listName)?.id
      : null;
    const tasks = Object.values(board.tasks)
      .filter((task) => !query || `${task.title} ${task.notes}`.toLowerCase().includes(query))
      .filter((task) => !status || status === "all" || (status === "completed" ? task.completed : !task.completed))
      .filter((task) => date === null || (date === "unscheduled" ? task.date === null : task.date === date))
      .filter((task) => !listIdFilter || task.listId === listIdFilter)
      .filter((task) => !listName || task.listId === namedListId)
      .sort(taskSort);
    return json(res, 200, { revision: board.revision, tasks });
  }

  if (req.method === "POST" && pathname === "/api/tasks") {
    const result = await store.createTask(await body(req));
    return json(res, 201, { revision: result.document.revision, task: result.value });
  }

  const moveMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/move$/);
  if (moveMatch && req.method === "POST") {
    const result = await store.moveTask(decodeURIComponent(moveMatch[1]), await body(req));
    return json(res, 200, { revision: result.document.revision, task: result.value });
  }

  const taskId = match("tasks", pathname);
  if (taskId && req.method === "PATCH") {
    const result = await store.updateTask(taskId, await body(req));
    return json(res, 200, { revision: result.document.revision, task: result.value });
  }
  if (taskId && req.method === "DELETE") {
    const result = await store.deleteTask(taskId);
    return json(res, 200, { revision: result.document.revision, ...result.value });
  }

  if (req.method === "GET" && pathname === "/api/context") {
    const board = await store.read();
    const lists = Object.values(board.lists).sort(listSort).map((list) => ({
      ...list,
      tasks: Object.values(board.tasks)
        .filter((task) => task.listId === list.id)
        .sort(listTaskSort(list)),
    }));
    return json(res, 200, {
      app: "schedugrr",
      revision: board.revision,
      instruction: "Use task and list ids for precise edits. Dates use yyyy-MM-dd and optional local times use HH:mm. See /openapi.json for every operation.",
      lists,
    });
  }

  return json(res, 404, { error: "API route not found", openapi: "/openapi.json" });
}

async function serveFile(res, filePath) {
  const info = await stat(filePath);
  if (!info.isFile()) return false;
  const content = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  res.end(content);
  return true;
}

async function staticRoute(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return json(res, 404, { error: "Not found" });
  if (url.pathname === "/openapi.json") return serveFile(res, openApiPath);

  const candidate = resolve(distRoot, `.${decodeURIComponent(url.pathname)}`);
  if (candidate !== distRoot && !candidate.startsWith(`${distRoot}${sep}`)) {
    return json(res, 400, { error: "Invalid path" });
  }
  try {
    if (url.pathname !== "/" && (await serveFile(res, candidate))) return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    return await serveFile(res, resolve(distRoot, "index.html"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return json(res, 404, {
      error: "Frontend build not found. Run `npm run build`, or use `npm run dev` for development.",
    });
  }
}

export function createScheduGrrServer(store, services = {}) {
  return createServer(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    try {
      const url = new URL(req.url ?? "/", "http://schedugrr.local");
      if (url.pathname.startsWith("/api/")) {
        if (!isAllowedOrigin(req.headers.origin)) {
          throw new ApiError(403, "Browser requests are accepted only from localhost origins");
        }
        return await apiRoute(req, res, url, store, services);
      }
      return await staticRoute(req, res, url);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 500) console.error(error);
      return json(res, status, { error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
}

// Kept as a source-compatible alias for scripts written against the pre-rename API.
export const createOpenAgendaServer = createScheduGrrServer;
export const createOpenBoardServer = createScheduGrrServer;
