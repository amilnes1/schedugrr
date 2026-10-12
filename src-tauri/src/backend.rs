use crate::{
    calendar::{self, Calendar},
    store::{self, ApiError, Board, Result},
};
use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, Method, StatusCode, Uri},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::get,
    Router,
};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};
static DIST: include_dir::Dir<'_> = include_dir::include_dir!("$CARGO_MANIFEST_DIR/../dist");

pub struct Backend {
    pub board: Mutex<Board>,
    pub calendar: Mutex<Calendar>,
    pub dir: PathBuf,
    pub events: broadcast::Sender<u64>,
    generation: AtomicU64,
    _lock: fs::File,
}
impl Backend {
    pub fn open(dir: PathBuf) -> Result<Arc<Self>> {
        fs::create_dir_all(&dir)?;
        let lock = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(dir.join("desktop.lock"))?;
        fs2::FileExt::try_lock_exclusive(&lock).map_err(|_| {
            ApiError(
                409,
                "Another Tauri instance is using this data directory.".into(),
            )
        })?;
        migrate_files(&dir)?;
        let (events, _) = broadcast::channel(32);
        Ok(Arc::new(Self {
            board: Mutex::new(Board::open(dir.join("schedugrr.json"))?),
            calendar: Mutex::new(Calendar::open(&dir)?),
            dir,
            events,
            generation: AtomicU64::new(0),
            _lock: lock,
        }))
    }
    pub fn router(self: &Arc<Self>) -> Router {
        Router::new()
            .route("/api/events", get(events))
            .fallback(handle)
            .layer(DefaultBodyLimit::max(1_000_000))
            .with_state(self.clone())
    }
    fn changed(self: &Arc<Self>, revision: u64) {
        let _ = self.events.send(revision);
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let backend = self.clone();
        if backend.calendar.lock().unwrap().settings["enabled"] != true {
            return;
        }
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(350)).await;
            if backend.generation.load(Ordering::SeqCst) != generation {
                return;
            }
            let _ = tauri::async_runtime::spawn_blocking(move || {
                let board = backend.board.lock().unwrap().document.clone();
                if let Err(e) = backend.calendar.lock().unwrap().sync(&backend.dir, &board) {
                    eprintln!("Calendar sync: {}", e.1)
                }
            })
            .await;
        });
    }
    pub fn dispatch(
        self: &Arc<Self>,
        method: &str,
        path: &str,
        query: &str,
        input: Value,
    ) -> Result<(u16, Value)> {
        let segments: Vec<_> = path.trim_start_matches("/api/").split('/').collect();
        let resource = segments[0];
        if resource == "calendar" {
            let mut cal = self.calendar.lock().unwrap();
            return Ok((
                200,
                match (method, segments.get(1).copied().unwrap_or("")) {
                    ("GET", "status") => cal.status(),
                    ("POST", "access") => {
                        let mut r = calendar::native(1, &Value::Null)?;
                        r["status"] = cal.status();
                        r
                    }
                    ("GET", "calendars") => {
                        json!({"calendars":if calendar::authorization()=="fullAccess"{calendar::native(2,&Value::Null)?}else{json!([])}})
                    }
                    ("PUT", "settings") => {
                        let board = self.board.lock().unwrap().document.clone();
                        cal.update(&input, &self.dir, &board)?
                    }
                    ("POST", "sync") => {
                        let board = self.board.lock().unwrap().document.clone();
                        let sync = cal.sync(&self.dir, &board)?;
                        json!({"sync":sync,"status":cal.status()})
                    }
                    _ => return store::fail(404, "API route not found"),
                },
            ));
        }
        if resource == "preferences" {
            let path = self.dir.join("preferences.json");
            if method == "GET" {
                return Ok((200, store::read_json(&path, json!({}))?));
            }
            if method == "PUT" && input.is_object() {
                let allowed: serde_json::Map<_, _> = input
                    .as_object()
                    .unwrap()
                    .iter()
                    .filter(|(k, v)| {
                        ["schedugrr.ui.v1", "schedugrr.remarks.v1"].contains(&k.as_str())
                            && v.is_string()
                    })
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();
                store::atomic_write(&path, &Value::Object(allowed))?;
                return Ok((200, json!({"ok":true})));
            }
            return store::fail(400, "Invalid preferences");
        }
        let mut board = self.board.lock().unwrap();
        if method == "GET" {
            let d = &board.document;
            let revision = &d["revision"];
            return Ok((
                200,
                match resource {
                    "health" => {
                        json!({"ok":true,"app":"schedugrr","version":1,"initialized":d["initialized"],"revision":revision,"desktop":"tauri"})
                    }
                    "board" => d.clone(),
                    "lists" => json!({"revision":revision,"lists":store::lists(d)}),
                    "context" => {
                        let lists: Vec<_> = store::lists(d)
                            .into_iter()
                            .map(|mut l| {
                                l["tasks"] = json!(store::list_tasks(d, l["id"].as_str().unwrap()));
                                l
                            })
                            .collect();
                        json!({"app":"schedugrr","revision":revision,"instruction":"Use task and list ids for precise edits. Dates use yyyy-MM-dd and optional local times use HH:mm. See /openapi.json for every operation.","lists":lists})
                    }
                    "tasks" => {
                        let q: std::collections::HashMap<_, _> =
                            url::form_urlencoded::parse(query.as_bytes())
                                .into_owned()
                                .collect();
                        let named = q
                            .get("listName")
                            .and_then(|name| {
                                store::lists(d).into_iter().find(|l| {
                                    store::text(&l["name"]).to_lowercase()
                                        == name.trim().to_lowercase()
                                })
                            })
                            .map(|l| store::text(&l["id"]));
                        let mut tasks: Vec<Value> = d["tasks"]
                            .as_object()
                            .unwrap()
                            .values()
                            .filter(|t| {
                                q.get("q").is_none_or(|q| {
                                    format!(
                                        "{} {}",
                                        store::text(&t["title"]),
                                        store::text(&t["notes"])
                                    )
                                    .to_lowercase()
                                    .contains(&q.trim().to_lowercase())
                                }) && q.get("status").is_none_or(|s| {
                                    s == "all"
                                        || store::truth(&t["completed"]) == (s == "completed")
                                }) && q.get("date").is_none_or(|s| {
                                    if s == "unscheduled" {
                                        t["date"].is_null()
                                    } else {
                                        t["date"] == *s
                                    }
                                }) && q.get("listId").is_none_or(|s| t["listId"] == *s)
                                    && (!q.contains_key("listName")
                                        || named.as_ref().is_some_and(|s| t["listId"] == *s))
                            })
                            .cloned()
                            .collect();
                        tasks.sort_by(|a, b| {
                            let ad = a["date"].as_str();
                            let bd = b["date"].as_str();
                            match (ad, bd) {
                                (None, None) => a["order"].as_i64().cmp(&b["order"].as_i64()),
                                (None, Some(_)) => std::cmp::Ordering::Greater,
                                (Some(_), None) => std::cmp::Ordering::Less,
                                (Some(ad), Some(bd)) => ad
                                    .cmp(bd)
                                    .then_with(|| {
                                        a["time"]
                                            .as_str()
                                            .unwrap_or("99:99")
                                            .cmp(b["time"].as_str().unwrap_or("99:99"))
                                    })
                                    .then_with(|| {
                                        a["dayOrder"].as_i64().cmp(&b["dayOrder"].as_i64())
                                    }),
                            }
                        });
                        json!({"revision":revision,"tasks":tasks})
                    }
                    _ => return store::fail(404, "API route not found"),
                },
            ));
        }
        let valid = match (method, resource, segments.len()) {
            ("PUT", "board", 1)
            | ("POST", "lists" | "tasks", 1)
            | ("PATCH" | "DELETE", "lists" | "tasks", 2) => true,
            ("POST", "tasks", 3) => segments[2] == "move",
            _ => false,
        };
        if !valid {
            return store::fail(404, "API route not found");
        }
        let id = segments.get(1).map(|s| {
            percent_encoding::percent_decode_str(s)
                .decode_utf8_lossy()
                .into_owned()
        });
        let result = board.mutate(method, resource, id.as_deref(), &input)?;
        let revision = board.document["revision"].as_u64().unwrap();
        drop(board);
        self.changed(revision);
        Ok((
            if method == "POST" && segments.len() == 1 {
                201
            } else {
                200
            },
            result,
        ))
    }
}
fn local_origin(origin: &str) -> bool {
    url::Url::parse(origin).is_ok_and(|u| {
        matches!(u.scheme(), "http" | "https")
            && matches!(u.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
    })
}
fn response(status: u16, body: Value, origin: Option<&str>) -> Response {
    let mut r = (
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        [
            ("Content-Type", "application/json; charset=utf-8"),
            ("Cache-Control", "no-store"),
        ],
        body.to_string(),
    )
        .into_response();
    if let Some(o) = origin.filter(|o| local_origin(o)) {
        r.headers_mut()
            .insert("Access-Control-Allow-Origin", o.parse().unwrap());
        r.headers_mut().insert("Vary", "Origin".parse().unwrap());
    }
    r.headers_mut().insert(
        "Access-Control-Allow-Headers",
        "Content-Type".parse().unwrap(),
    );
    r.headers_mut().insert(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS".parse().unwrap(),
    );
    r
}
// Set the existing desktop CSS marker before the first paint. Only a known
// native flavor is accepted; browser-development requests remain unchanged.
fn desktop_html(source: &[u8], query: &str) -> Option<String> {
    let requested = url::form_urlencoded::parse(query.as_bytes())
        .find_map(|(key, value)| (key == "desktop").then_some(value));
    let flavor = crate::desktop_flavor();
    if requested.as_deref() != Some(flavor) {
        return None;
    }
    Some(String::from_utf8_lossy(source).replacen(
        "<html ",
        &format!("<html data-desktop=\"{flavor}\" "),
        1,
    ))
}

async fn handle(
    State(backend): State<Arc<Backend>>,
    method: Method,
    headers: HeaderMap,
    uri: Uri,
    body: Bytes,
) -> Response {
    let origin = headers
        .get("origin")
        .and_then(|h| h.to_str().ok())
        .map(String::from);
    if origin.as_deref().is_some_and(|o| !local_origin(o)) {
        return response(
            403,
            json!({"error":"Browser requests are accepted only from localhost origins"}),
            None,
        );
    }
    if method == Method::OPTIONS {
        return response(204, Value::Null, origin.as_deref());
    }
    let path = uri.path().to_string();
    if path.starts_with("/api/") {
        let input = if body.is_empty() {
            json!({})
        } else {
            match serde_json::from_slice(&body) {
                Ok(v) => v,
                Err(_) => {
                    return response(
                        400,
                        json!({"error":"Request body must be valid JSON"}),
                        origin.as_deref(),
                    )
                }
            }
        };
        let query = uri.query().unwrap_or("").to_string();
        let method = method.to_string();
        return match tauri::async_runtime::spawn_blocking(move || {
            backend.dispatch(&method, &path, &query, input)
        })
        .await
        {
            Ok(Ok((status, value))) => response(status, value, origin.as_deref()),
            Ok(Err(ApiError(status, error))) => response(
                status,
                if error == "API route not found" {
                    json!({"error":error,"openapi":"/openapi.json"})
                } else {
                    json!({"error":error})
                },
                origin.as_deref(),
            ),
            Err(e) => response(500, json!({"error":e.to_string()}), origin.as_deref()),
        };
    }
    if method != Method::GET && method != Method::HEAD {
        return response(404, json!({"error":"Not found"}), None);
    }
    if path == "/openapi.json" {
        return (
            [("Content-Type", "application/json")],
            include_str!("../../openapi.json"),
        )
            .into_response();
    }
    let decoded = percent_encoding::percent_decode_str(&path).decode_utf8_lossy();
    if decoded.split('/').any(|p| p == "..") {
        return response(400, json!({"error":"Invalid path"}), None);
    }
    let name = decoded.trim_start_matches('/');
    let f = DIST
        .get_file(if name.is_empty() { "index.html" } else { name })
        .or_else(|| DIST.get_file("index.html"));
    match f {
        Some(f) => {
            let mime = match f.path().extension().and_then(|s| s.to_str()) {
                Some("html") => "text/html; charset=utf-8",
                Some("js") => "text/javascript",
                Some("css") => "text/css",
                Some("svg") => "image/svg+xml",
                _ => "application/octet-stream",
            };
            if mime.starts_with("text/html") {
                if let Some(html) = desktop_html(f.contents(), uri.query().unwrap_or("")) {
                    return (
                        [("Content-Type", mime), ("Cache-Control", "no-cache")],
                        html,
                    )
                        .into_response();
                }
            }
            (
                [
                    ("Content-Type", mime),
                    (
                        "Cache-Control",
                        if mime.starts_with("text/html") {
                            "no-cache"
                        } else {
                            "public, max-age=31536000, immutable"
                        },
                    ),
                ],
                f.contents(),
            )
                .into_response()
        }
        None => response(404, json!({"error":"Frontend build not found"}), None),
    }
}
async fn events(State(backend): State<Arc<Backend>>, headers: HeaderMap) -> Response {
    if headers
        .get("origin")
        .and_then(|h| h.to_str().ok())
        .is_some_and(|o| !local_origin(o))
    {
        return response(403, json!({"error":"Local origins only"}), None);
    }
    let subscription = backend.events.subscribe();
    let revision = backend.board.lock().unwrap().document["revision"]
        .as_u64()
        .unwrap_or(0);
    let stream = tokio_stream::once(Ok::<_, std::convert::Infallible>(
        Event::default().data(revision.to_string()),
    ))
    .chain(BroadcastStream::new(subscription).filter_map(|r| {
        r.ok().map(|revision| {
            Ok::<_, std::convert::Infallible>(Event::default().data(revision.to_string()))
        })
    }));
    Sse::new(stream)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(30)))
        .into_response()
}
fn migrate_files(dir: &Path) -> Result<()> {
    let parent = dir.parent().unwrap_or(dir);
    for legacy in [
        dir.to_path_buf(),
        parent.join("OpenAgenda"),
        parent.join("OpenBoard"),
    ] {
        for (old, new) in [
            ("schedugrr.json", "schedugrr.json"),
            ("openagenda.json", "schedugrr.json"),
            ("openboard.json", "schedugrr.json"),
            ("calendar-settings.json", "calendar-settings.json"),
            ("calendar-mappings.json", "calendar-mappings.json"),
            ("window-state.json", "window-state.json"),
        ] {
            let src = legacy.join(old);
            let dst = dir.join(new);
            if src != dst && src.is_file() && !dst.exists() {
                fs::copy(src, dst)?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn desktop_marker_is_ready_before_paint_and_rejects_unknown_values() {
        let source = b"<html lang=\"en\" data-theme=\"light\"><body></body></html>";
        let flavor = crate::desktop_flavor();
        let html = desktop_html(source, &format!("desktop={flavor}")).unwrap();
        assert!(html.contains(&format!("data-desktop=\"{flavor}\"")));
        assert!(html.contains("data-theme=\"light\""));
        assert!(desktop_html(source, "").is_none());
        assert!(desktop_html(source, "desktop=unknown").is_none());
        assert!(desktop_html(source, "desktop=%22%20onload%3Devil").is_none());
    }

    #[test]
    fn legacy_files_are_copied_and_originals_preserved() {
        let root = tempfile::tempdir().unwrap();
        let old = root.path().join("OpenAgenda");
        std::fs::create_dir_all(&old).unwrap();
        let board = json!({"app":"openagenda","version":1,"initialized":true,"revision":17,"lists":{},"tasks":{}});
        store::atomic_write(&old.join("openagenda.json"), &board).unwrap();
        let current = root.path().join("ScheduGrr");
        let backend = Backend::open(current.clone()).unwrap();
        assert_eq!(backend.board.lock().unwrap().document["revision"], 17);
        assert!(old.join("openagenda.json").exists());
        assert!(
            Backend::open(current).is_err(),
            "Two processes cannot write the same board"
        );
    }
    #[test]
    fn concurrent_edits_persist_and_invalid_edits_roll_back() {
        let dir = tempfile::tempdir().unwrap();
        let backend = Backend::open(dir.path().to_path_buf()).unwrap();
        let threads: Vec<_> = (0..20)
            .map(|i| {
                let b = backend.clone();
                std::thread::spawn(move || {
                    b.dispatch(
                        "POST",
                        "/api/tasks",
                        "",
                        json!({"title":format!("Task {i}")}),
                    )
                    .unwrap();
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap()
        }
        let board = backend.board.lock().unwrap().document.clone();
        assert_eq!(board["tasks"].as_object().unwrap().len(), 20);
        let task = board["tasks"].as_object().unwrap().keys().next().unwrap();
        assert!(backend
            .dispatch(
                "PATCH",
                &format!("/api/tasks/{task}"),
                "",
                json!({"title":"changed","time":"25:00"})
            )
            .is_err());
        assert_eq!(backend.board.lock().unwrap().document, board);
        let persisted = store::read_json(&dir.path().join("schedugrr.json"), Value::Null).unwrap();
        assert_eq!(persisted, board);
    }
}
