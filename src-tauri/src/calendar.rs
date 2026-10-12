#[cfg(target_os = "macos")]
use crate::store::ApiError;
use crate::store::{atomic_write, fail, read_json, Result};
use serde_json::{json, Value};
use std::path::Path;

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn schedugrr_calendar_call(
        operation: i32,
        input: *const std::ffi::c_char,
    ) -> *mut std::ffi::c_char;
    fn schedugrr_calendar_free(result: *mut std::ffi::c_char);
}
pub fn native(operation: i32, input: &Value) -> Result<Value> {
    #[cfg(target_os = "macos")]
    {
        let s =
            std::ffi::CString::new(input.to_string()).map_err(|e| ApiError(400, e.to_string()))?;
        // The adapter owns its returned UTF-8 buffer until explicitly released.
        let raw = unsafe { schedugrr_calendar_call(operation, s.as_ptr()) };
        if raw.is_null() {
            return fail(500, "Calendar bridge returned no result");
        }
        let output = unsafe { std::ffi::CStr::from_ptr(raw) }
            .to_string_lossy()
            .into_owned();
        unsafe { schedugrr_calendar_free(raw) };
        if operation == 0 {
            return Ok(json!(output));
        }
        let result: Value = serde_json::from_str(&output)?;
        if let Some(error) = result.get("error") {
            return fail(500, error.as_str().unwrap_or("Calendar operation failed"));
        };
        Ok(result)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (operation, input);
        fail(
            501,
            "Native calendar sync is available in the macOS desktop app.",
        )
    }
}
pub fn authorization() -> String {
    native(0, &Value::Null)
        .ok()
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or("unavailable".into())
}
pub fn platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else {
        "linux"
    }
}
pub struct Calendar {
    pub settings: Value,
    pub mappings: Value,
    pub last_sync: Value,
}
impl Calendar {
    pub fn open(dir: &Path) -> Result<Self> {
        Ok(Self {
            settings: read_json(
                &dir.join("calendar-settings.json"),
                json!({"enabled":false,"calendarId":null,"includeUntimed":true,"durationMinutes":30}),
            )?,
            mappings: read_json(&dir.join("calendar-mappings.json"), json!({}))?,
            last_sync: Value::Null,
        })
    }
    pub fn status(&self) -> Value {
        json!({"available":cfg!(target_os="macos"),"platform":platform(),"authorization":authorization(),"settings":self.settings,"lastSync":self.last_sync})
    }
    pub fn update(&mut self, input: &Value, dir: &Path, board: &Value) -> Result<Value> {
        if !cfg!(target_os = "macos") {
            return fail(
                501,
                "Native calendar sync is available in the macOS desktop app.",
            );
        }
        let mut next = self.settings.clone();
        for key in ["enabled", "includeUntimed"] {
            if let Some(v) = input.get(key) {
                next[key] = json!(crate::store::truth(v));
            }
        }
        if let Some(v) = input.get("calendarId") {
            let s = crate::store::text(v).trim().to_string();
            next["calendarId"] = if s.is_empty() { Value::Null } else { json!(s) }
        }
        if let Some(v) = input.get("durationMinutes") {
            let d = v
                .as_i64()
                .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
                .unwrap_or(0);
            if !(5..=720).contains(&d) {
                return fail(400, "durationMinutes must be an integer from 5 to 720");
            };
            next["durationMinutes"] = json!(d)
        }
        if next["enabled"] == true && next["calendarId"].is_null() {
            return fail(400, "Choose a calendar before enabling sync.");
        }
        if next["enabled"] == true && authorization() != "fullAccess" {
            return fail(403, "Calendar access is required before enabling sync.");
        }
        atomic_write(&dir.join("calendar-settings.json"), &next)?;
        self.settings = next;
        if self.settings["enabled"] == true {
            self.sync(dir, board)?;
        }
        Ok(self.status())
    }
    pub fn sync(&mut self, dir: &Path, board: &Value) -> Result<Value> {
        if !cfg!(target_os = "macos") {
            return fail(
                501,
                "Native calendar sync is available in the macOS desktop app.",
            );
        }
        if self.settings["enabled"] != true || self.settings["calendarId"].is_null() {
            return fail(409, "Calendar sync is not enabled.");
        }
        let tasks: Vec<_> = board["tasks"]
            .as_object()
            .unwrap()
            .values()
            .map(|t| {
                let mut t = t.clone();
                t["listName"] = board["lists"][t["listId"].as_str().unwrap_or("")]["name"].clone();
                t
            })
            .collect();
        let result = native(
            3,
            &json!({"tasks":tasks,"mappings":self.mappings,"calendarId":self.settings["calendarId"],"includeUntimed":self.settings["includeUntimed"],"durationMinutes":self.settings["durationMinutes"]}),
        )?;
        self.mappings = result.get("mappings").cloned().unwrap_or(json!({}));
        atomic_write(&dir.join("calendar-mappings.json"), &self.mappings)?;
        self.last_sync = json!({"at":chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true),"created":result["created"],"updated":result["updated"],"deleted":result["deleted"],"skipped":result["skipped"],"errors":result["errors"]});
        Ok(self.last_sync.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_and_persists_calendar_settings_without_granting_access() {
        let dir = tempfile::tempdir().unwrap();
        let mut calendar = Calendar::open(dir.path()).unwrap();
        let board = json!({"lists":{}, "tasks":{}});
        if cfg!(target_os = "macos") {
            assert_eq!(
                calendar
                    .update(&json!({"enabled":true}), dir.path(), &board)
                    .unwrap_err()
                    .0,
                400
            );
            assert_eq!(
                calendar
                    .update(&json!({"durationMinutes":721}), dir.path(), &board)
                    .unwrap_err()
                    .0,
                400
            );
            assert_eq!(calendar.settings["durationMinutes"], 30);
            calendar
                .update(
                    &json!({"enabled":false,"includeUntimed":false,"durationMinutes":45}),
                    dir.path(),
                    &board,
                )
                .unwrap();
            let reopened = Calendar::open(dir.path()).unwrap();
            assert_eq!(reopened.settings["durationMinutes"], 45);
            assert_eq!(reopened.settings["includeUntimed"], false);
            assert_eq!(calendar.sync(dir.path(), &board).unwrap_err().0, 409);
        } else {
            assert_eq!(
                calendar
                    .update(&json!({"enabled":true}), dir.path(), &board)
                    .unwrap_err()
                    .0,
                501
            );
            assert_eq!(calendar.sync(dir.path(), &board).unwrap_err().0, 501);
        }
    }
}
