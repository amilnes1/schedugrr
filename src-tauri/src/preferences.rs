use crate::store::{atomic_write, Result};
use serde_json::json;
use std::path::Path;

/// Chromium and WKWebView use different profile formats. Read a temporary copy
/// of the old LevelDB so migration never locks or modifies the Electron profile.
pub fn migrate(dir: &Path) -> Result<()> {
    let target = dir.join("preferences.json");
    if target.exists() {
        return Ok(());
    }
    let sources = [
        dir.join("Local Storage/leveldb"),
        dir.parent()
            .unwrap_or(dir)
            .join("OpenAgenda/Local Storage/leveldb"),
    ];
    let mut values = serde_json::Map::new();
    for source in sources {
        if !source.is_dir() {
            continue;
        }
        let copy = tempfile::tempdir()?;
        for entry in std::fs::read_dir(source)? {
            let entry = entry?;
            if entry.file_type()?.is_file() && entry.file_name() != "LOCK" {
                std::fs::copy(entry.path(), copy.path().join(entry.file_name()))?;
            }
        }
        let options = leveldb::Options {
            create_if_missing: false,
            ..Default::default()
        };
        match leveldb::DB::open(copy.path(), options) {
            Ok(mut db) => {
                use leveldb::LdbIterator;
                let mut it = db
                    .new_iter()
                    .map_err(|e| crate::store::ApiError(500, e.to_string()))?;
                while let Some((key, value)) = it.next() {
                    for name in [
                        "schedugrr.ui.v1",
                        "schedugrr.remarks.v1",
                        "openagenda.ui.v1",
                        "openboard.ui.v1",
                    ] {
                        if key.ends_with(name.as_bytes()) && key.starts_with(b"_http://127.0.0.1:")
                        {
                            let decoded = match value.first() {
                                Some(1) => String::from_utf8_lossy(&value[1..]).into_owned(),
                                Some(0) => String::from_utf16_lossy(
                                    &value[1..]
                                        .as_chunks::<2>()
                                        .0
                                        .iter()
                                        .map(|b| u16::from_le_bytes([b[0], b[1]]))
                                        .collect::<Vec<_>>(),
                                ),
                                _ => continue,
                            };
                            let destination = if name.ends_with("ui.v1") {
                                "schedugrr.ui.v1"
                            } else {
                                "schedugrr.remarks.v1"
                            };
                            if serde_json::from_str::<serde_json::Value>(&decoded).is_ok() {
                                values.entry(destination).or_insert(json!(decoded));
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Could not read old appearance settings: {e}");
                continue;
            }
        }
    }
    atomic_write(&target, &serde_json::Value::Object(values))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chromium_preferences_migrate_without_modifying_source() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("Local Storage/leveldb");
        std::fs::create_dir_all(&source).unwrap();
        let key = b"_http://127.0.0.1:8787\0\x01schedugrr.ui.v1";
        let value = b"\x01{\"state\":{\"theme\":\"dark\",\"remarkMode\":\"cheer\"},\"version\":0}";
        {
            let mut db = leveldb::DB::open(&source, leveldb::Options::default()).unwrap();
            db.put(key, value).unwrap();
            db.flush().unwrap();
        }
        migrate(dir.path()).unwrap();
        let migrated: serde_json::Value =
            serde_json::from_slice(&std::fs::read(dir.path().join("preferences.json")).unwrap())
                .unwrap();
        assert_eq!(
            migrated["schedugrr.ui.v1"],
            String::from_utf8_lossy(&value[1..]).as_ref()
        );
        let mut db = leveldb::DB::open(&source, leveldb::Options::default()).unwrap();
        assert_eq!(db.get(key).unwrap(), value);
    }
}
