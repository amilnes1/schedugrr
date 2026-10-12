use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug)]
pub struct ApiError(pub u16, pub String);
pub type Result<T> = std::result::Result<T, ApiError>;
impl From<std::io::Error> for ApiError {
    fn from(e: std::io::Error) -> Self {
        Self(500, e.to_string())
    }
}
impl From<serde_json::Error> for ApiError {
    fn from(e: serde_json::Error) -> Self {
        Self(400, e.to_string())
    }
}
pub fn fail<T>(status: u16, message: impl Into<String>) -> Result<T> {
    Err(ApiError(status, message.into()))
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub fn id(prefix: &str) -> String {
    format!(
        "{}_{}",
        prefix,
        &uuid::Uuid::new_v4().simple().to_string()[..10]
    )
}
pub fn text(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        _ => v.to_string(),
    }
}
pub fn truth(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64() != Some(0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
pub fn atomic_write(path: &Path, value: &Value) -> Result<()> {
    fs::create_dir_all(path.parent().unwrap())?;
    let mut file = tempfile::NamedTempFile::new_in(path.parent().unwrap())?;
    use std::io::Write;
    serde_json::to_writer_pretty(&mut file, value)?;
    file.write_all(b"\n")?;
    file.as_file().sync_all()?;
    file.persist(path)
        .map_err(|e| ApiError(500, e.to_string()))?;
    Ok(())
}
pub fn read_json(path: &Path, default: Value) -> Result<Value> {
    match fs::read(path) {
        Ok(b) => Ok(serde_json::from_slice(&b)?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(default),
        Err(e) => Err(e.into()),
    }
}
fn choice(v: &Value, options: &[&str], field: &str) -> Result<()> {
    if options.contains(&v.as_str().unwrap_or("")) {
        Ok(())
    } else {
        fail(
            400,
            format!("{field} must be one of: {}", options.join(", ")),
        )
    }
}
fn date(v: &Value) -> Result<()> {
    if v.is_null() {
        return Ok(());
    }
    let s = v.as_str().unwrap_or("");
    if s.len() == 10
        && s.bytes().enumerate().all(|(i, b)| {
            if i == 4 || i == 7 {
                b == b'-'
            } else {
                b.is_ascii_digit()
            }
        })
    {
        Ok(())
    } else {
        fail(400, "date must be null or yyyy-MM-dd")
    }
}
fn time(v: &Value) -> Result<()> {
    if v.is_null() {
        return Ok(());
    }
    let s = v.as_str().unwrap_or("");
    let b = s.as_bytes();
    if b.len() == 5
        && b[2] == b':'
        && b.iter()
            .enumerate()
            .all(|(i, c)| i == 2 || c.is_ascii_digit())
        && s[..2].parse::<u8>().unwrap_or(99) < 24
        && s[3..].parse::<u8>().unwrap_or(99) < 60
    {
        Ok(())
    } else {
        fail(400, "time must be null or HH:mm")
    }
}
pub fn validate(input: &Value) -> Result<Value> {
    let mut doc = input.clone();
    if !doc["lists"].is_object() || !doc["tasks"].is_object() {
        return fail(400, "lists and tasks records are required");
    }
    for (id, list) in doc["lists"].as_object_mut().unwrap() {
        if list["id"] != *id || !list["name"].is_string() || !list["order"].is_number() {
            return fail(400, format!("Invalid list: {id}"));
        }
        choice(
            &list["color"],
            &["accent", "sage", "gold", "sky", "plum", "ink"],
            "color",
        )?;
        if list["taskOrder"].is_null() {
            list["taskOrder"] = json!("priority")
        };
        choice(&list["taskOrder"], &["priority", "manual"], "taskOrder")?;
    }
    let lists = doc["lists"].clone();
    for (id, task) in doc["tasks"].as_object_mut().unwrap() {
        if task["id"] != *id
            || !task["title"].is_string()
            || lists[task["listId"].as_str().unwrap_or("")].is_null()
        {
            return fail(400, format!("Invalid task: {id}"));
        }
        date(&task["date"])?;
        time(&task["time"])?;
        if task["time"].is_string() && task["date"].is_null() {
            return fail(400, format!("Task time requires a date: {id}"));
        }
        choice(
            &task["priority"],
            &["none", "low", "medium", "high"],
            "priority",
        )?;
        if task.get("time").is_none() {
            task["time"] = Value::Null;
        }
    }
    Ok(doc)
}
pub fn rank(v: &Value) -> i64 {
    match v.as_str() {
        Some("high") => 3,
        Some("medium") => 2,
        Some("low") => 1,
        _ => 0,
    }
}
pub fn lists(doc: &Value) -> Vec<Value> {
    let mut v: Vec<_> = doc["lists"]
        .as_object()
        .unwrap()
        .values()
        .cloned()
        .collect();
    v.sort_by_key(|x| x["order"].as_i64().unwrap_or(0));
    v
}
pub fn list_tasks(doc: &Value, list_id: &str) -> Vec<Value> {
    let mut v: Vec<_> = doc["tasks"]
        .as_object()
        .unwrap()
        .values()
        .filter(|x| x["listId"] == list_id)
        .cloned()
        .collect();
    let manual = doc["lists"][list_id]["taskOrder"] == "manual";
    v.sort_by_key(|x| {
        (
            if manual { 0 } else { -rank(&x["priority"]) },
            x["order"].as_i64().unwrap_or(0),
        )
    });
    v
}
fn ids(doc: &Value, key: &str, value: &Value) -> Vec<String> {
    let mut v: Vec<_> = doc["tasks"]
        .as_object()
        .unwrap()
        .values()
        .filter(|x| x[key] == *value)
        .collect();
    if key == "listId" {
        return list_tasks(doc, value.as_str().unwrap_or(""))
            .iter()
            .map(|t| text(&t["id"]))
            .collect();
    }
    v.sort_by_key(|t| t["dayOrder"].as_i64().unwrap_or(0));
    v.iter().map(|t| text(&t["id"])).collect()
}
fn reindex(doc: &mut Value, ids: Vec<String>, key: &str) {
    for (i, id) in ids.iter().enumerate() {
        doc["tasks"][id][key] = json!(i)
    }
}
fn insert(mut ids: Vec<String>, id: &str, index: &Value) -> Vec<String> {
    ids.retain(|x| x != id);
    let at = index
        .as_i64()
        .unwrap_or(ids.len() as i64)
        .clamp(0, ids.len() as i64) as usize;
    ids.insert(at, id.into());
    ids
}
fn resolve_list(doc: &Value, input: &Value) -> Result<String> {
    if truth(&input["listId"]) {
        let id = text(&input["listId"]);
        if doc["lists"][&id].is_null() {
            return fail(404, format!("List not found: {id}"));
        }
        return Ok(id);
    }
    if truth(&input["listName"]) {
        let name = text(&input["listName"]).trim().to_lowercase();
        return lists(doc)
            .iter()
            .find(|l| text(&l["name"]).to_lowercase() == name)
            .map(|l| text(&l["id"]))
            .ok_or(ApiError(
                404,
                format!("List not found: {}", text(&input["listName"])),
            ));
    }
    fail(400, "listId or listName is required")
}
fn move_list(doc: &mut Value, task_id: &str, target: &str, index: &Value) -> Result<()> {
    if doc["lists"][target].is_null() {
        return fail(404, format!("List not found: {target}"));
    }
    let previous = doc["tasks"][task_id]["listId"].clone();
    doc["tasks"][task_id]["listId"] = json!(target);
    reindex(
        doc,
        insert(ids(doc, "listId", &json!(target)), task_id, index),
        "order",
    );
    if !index.is_null() {
        doc["lists"][target]["taskOrder"] = json!("manual")
    }
    if previous != target {
        reindex(doc, ids(doc, "listId", &previous), "order")
    };
    Ok(())
}
fn move_date(doc: &mut Value, id: &str, target: &Value, index: &Value) -> Result<()> {
    date(target)?;
    let previous = doc["tasks"][id]["date"].clone();
    doc["tasks"][id]["date"] = target.clone();
    if target.is_null() {
        doc["tasks"][id]["time"] = Value::Null;
        doc["tasks"][id]["dayOrder"] = json!(0)
    } else {
        reindex(doc, insert(ids(doc, "date", target), id, index), "dayOrder")
    }
    if !previous.is_null() && previous != *target {
        reindex(doc, ids(doc, "date", &previous), "dayOrder")
    };
    Ok(())
}
pub struct Board {
    pub document: Value,
    path: PathBuf,
}
impl Board {
    pub fn open(path: PathBuf) -> Result<Self> {
        let empty = json!({"app":"schedugrr","version":1,"initialized":false,"revision":0,"lists":{},"tasks":{}});
        let mut document = read_json(&path, empty)?;
        document = validate(&document)?;
        document["app"] = json!("schedugrr");
        Ok(Self { document, path })
    }
    pub fn mutate(
        &mut self,
        method: &str,
        resource: &str,
        id_arg: Option<&str>,
        input: &Value,
    ) -> Result<Value> {
        let mut d = self.document.clone();
        let result = (|| -> Result<Value> {
            if resource == "board" {
                let v = validate(input)?;
                d["lists"] = v["lists"].clone();
                d["tasks"] = v["tasks"].clone();
                return Ok(Value::Null);
            }
            if resource == "lists" {
                if method == "POST" {
                    let name = text(&input["name"]).trim().to_string();
                    if name.is_empty() {
                        return fail(400, "name is required");
                    };
                    let color = input.get("color").cloned().unwrap_or(json!("ink"));
                    choice(
                        &color,
                        &["accent", "sage", "gold", "sky", "plum", "ink"],
                        "color",
                    )?;
                    let id = id("list");
                    let list = json!({"id":id,"name":name,"color":color,"order":lists(&d).len(),"taskOrder":"priority"});
                    d["lists"][&id] = list.clone();
                    return Ok(json!({"list":list}));
                }
                let id = id_arg.unwrap_or("");
                if d["lists"][id].is_null() {
                    return fail(404, format!("List not found: {id}"));
                }
                if method == "DELETE" {
                    d["lists"].as_object_mut().unwrap().shift_remove(id);
                    d["tasks"]
                        .as_object_mut()
                        .unwrap()
                        .retain(|_, t| t["listId"] != id);
                    for (i, l) in lists(&d).iter().enumerate() {
                        d["lists"][text(&l["id"])]["order"] = json!(i)
                    }
                    return Ok(json!({"deleted":id}));
                }
                for key in ["name", "color", "taskOrder"] {
                    if let Some(value) = input.get(key) {
                        match key {
                            "name" => {
                                let name = text(value).trim().to_string();
                                if name.is_empty() {
                                    return fail(400, "name cannot be empty");
                                };
                                d["lists"][id][key] = json!(name)
                            }
                            "color" => {
                                choice(
                                    value,
                                    &["accent", "sage", "gold", "sky", "plum", "ink"],
                                    key,
                                )?;
                                d["lists"][id][key] = value.clone()
                            }
                            _ => {
                                choice(value, &["priority", "manual"], key)?;
                                d["lists"][id][key] = value.clone()
                            }
                        }
                    }
                }
                return Ok(json!({"list":d["lists"][id]}));
            }
            if method == "POST" && id_arg.is_none() {
                let title = text(&input["title"]).trim().to_string();
                if title.is_empty() {
                    return fail(400, "title is required");
                }
                let list = if truth(&input["listId"]) || truth(&input["listName"]) {
                    resolve_list(&d, input)?
                } else if let Some(l) = lists(&d).first() {
                    text(&l["id"])
                } else {
                    let i = id("list");
                    d["lists"][&i] = json!({"id":i,"name":"Inbox","color":"accent","order":0,"taskOrder":"priority"});
                    i
                };
                let dt = input["date"].clone();
                let tm = input["time"].clone();
                date(&dt)?;
                time(&tm)?;
                if !tm.is_null() && dt.is_null() {
                    return fail(400, "time requires a scheduled date");
                }
                let priority = input.get("priority").cloned().unwrap_or(json!("none"));
                choice(&priority, &["none", "low", "medium", "high"], "priority")?;
                let i = id("task");
                let task = json!({"id":i,"title":title,"notes":text(&input["notes"]),"listId":list,"date":dt,"time":tm,"completed":truth(&input["completed"]),"priority":priority,"order":ids(&d,"listId",&json!(list)).len(),"dayOrder":if dt.is_null(){0}else{ids(&d,"date",&dt).len()},"createdAt":now(),"updatedAt":now()});
                d["tasks"][&i] = task.clone();
                return Ok(json!({"task":task}));
            }
            let id = id_arg.unwrap_or("");
            if d["tasks"][id].is_null() {
                return fail(404, format!("Task not found: {id}"));
            }
            if method == "DELETE" {
                let t = d["tasks"][id].clone();
                d["tasks"].as_object_mut().unwrap().shift_remove(id);
                reindex(
                    &mut d,
                    ids(&self.document, "listId", &t["listId"])
                        .into_iter()
                        .filter(|i| i != id)
                        .collect(),
                    "order",
                );
                if !t["date"].is_null() {
                    let ids = ids(&d, "date", &t["date"]);
                    reindex(&mut d, ids, "dayOrder")
                };
                return Ok(json!({"deleted":id}));
            }
            if let Some(t) = input.get("title") {
                let t = text(t).trim().to_string();
                if t.is_empty() {
                    return fail(400, "title cannot be empty");
                };
                d["tasks"][id]["title"] = json!(t)
            }
            if let Some(n) = input.get("notes") {
                d["tasks"][id]["notes"] = json!(text(n))
            }
            if let Some(c) = input.get("completed") {
                d["tasks"][id]["completed"] = json!(truth(c))
            }
            if let Some(p) = input.get("priority") {
                choice(p, &["none", "low", "medium", "high"], "priority")?;
                d["tasks"][id]["priority"] = p.clone()
            }
            if input.get("listId").is_some() || input.get("listName").is_some() {
                let l = resolve_list(&d, input)?;
                move_list(&mut d, id, &l, &input["index"])?
            }
            if let Some(dt) = input.get("date") {
                move_date(&mut d, id, dt, &input["index"])?
            }
            if let Some(tm) = input.get("time") {
                time(tm)?;
                if !tm.is_null() && d["tasks"][id]["date"].is_null() {
                    return fail(400, "time requires a scheduled date");
                };
                d["tasks"][id]["time"] = tm.clone()
            }
            d["tasks"][id]["updatedAt"] = json!(now());
            Ok(json!({"task":d["tasks"][id]}))
        })()?;
        d["initialized"] = json!(true);
        d["version"] = json!(1);
        d["revision"] = json!(self.document["revision"].as_u64().unwrap_or(0) + 1);
        atomic_write(&self.path, &d)?;
        self.document = d;
        if resource == "board" {
            Ok(self.document.clone())
        } else {
            let mut r = result;
            r["revision"] = self.document["revision"].clone();
            Ok(r)
        }
    }
}
