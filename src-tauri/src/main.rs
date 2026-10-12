#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod backend;
mod calendar;
mod preferences;
mod store;
use std::path::PathBuf;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;

fn data_directory() -> PathBuf {
    if let Some(path) = std::env::var_os("SCHEDUGRR_USER_DATA_DIR")
        .or_else(|| std::env::var_os("OPENAGENDA_USER_DATA_DIR"))
    {
        return PathBuf::from(path);
    }
    #[cfg(target_os = "macos")]
    {
        PathBuf::from(std::env::var_os("HOME").unwrap())
            .join("Library/Application Support/ScheduGrr")
    }
    #[cfg(target_os = "windows")]
    {
        PathBuf::from(std::env::var_os("APPDATA").unwrap()).join("ScheduGrr")
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(std::env::var_os("HOME").unwrap()).join(".config"))
            .join("ScheduGrr")
    }
}
fn desktop_flavor() -> &'static str {
    if cfg!(target_os = "macos") {
        "mac"
    } else {
        calendar::platform()
    }
}

fn port() -> u16 {
    std::env::var("SCHEDUGRR_PORT")
        .or_else(|_| std::env::var("OPENAGENDA_PORT"))
        .ok()
        .and_then(|s| s.parse().ok())
        .filter(|p| *p > 0)
        .unwrap_or(8787)
}

#[tauri::command]
async fn export_document(
    app: tauri::AppHandle,
    name: String,
    content: String,
) -> std::result::Result<bool, String> {
    if content.len() > 1_000_000 {
        return Err("Export is too large".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let file = app
            .dialog()
            .file()
            .set_file_name(name)
            .add_filter("ScheduGrr JSON", &["json"])
            .blocking_save_file();
        match file {
            Some(path) => {
                std::fs::write(path.into_path().map_err(|e| e.to_string())?, content)
                    .map_err(|e| e.to_string())?;
                Ok(true)
            }
            None => Ok(false),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
fn create_window(app: &tauri::AppHandle, url: &str, dir: &std::path::Path) -> tauri::Result<()> {
    let state =
        store::read_json(&dir.join("window-state.json"), serde_json::json!({})).unwrap_or_default();
    let width = state["width"].as_f64().unwrap_or(1440.0).max(980.0);
    let height = state["height"].as_f64().unwrap_or(900.0).max(660.0);
    let origin = url::Url::parse(url).unwrap().origin();
    #[allow(unused_mut)]
    let mut window=WebviewWindowBuilder::new(app,"main",WebviewUrl::External(url.parse().unwrap()))
        .title("ScheduGrr").inner_size(width,height).min_inner_size(980.0,660.0)
        .data_directory(dir.join("WebKit"))
        .on_navigation(move|url| {if url.origin()==origin{return true}
if url.scheme()=="https"{let _=open::that(url.as_str());}false})
        .initialization_script("document.addEventListener('mousedown',e=>{if(e.target.closest('[data-tauri-drag-region]')&&!e.target.closest('button,input,select,a,[tabindex]')&&e.buttons===1)window.__TAURI__.window.getCurrentWindow().startDragging()});")
        ;
    #[cfg(target_os = "macos")]
    {
        window = window
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(tauri::LogicalPosition::new(18.0, 19.0));
    }
    let webview = window.build()?;
    if let (Some(x), Some(y)) = (state["x"].as_f64(), state["y"].as_f64()) {
        let _ = webview.set_position(tauri::LogicalPosition::new(x, y));
    }
    let path = dir.join("window-state.json");
    let handle = webview.clone();
    webview.on_window_event(move |event| {
        #[cfg(target_os = "macos")]
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.hide();
        }
        if matches!(event, WindowEvent::CloseRequested { .. })
            && !handle.is_maximized().unwrap_or(false)
        {
            if let (Ok(size), Ok(scale), Ok(position)) = (
                handle.inner_size(),
                handle.scale_factor(),
                handle.outer_position(),
            ) {
                let s = size.to_logical::<f64>(scale);
                let p = position.to_logical::<f64>(scale);
                let _ = store::atomic_write(
                    &path,
                    &serde_json::json!({"width":s.width,"height":s.height,"x":p.x,"y":p.y}),
                );
            }
        }
    });
    Ok(())
}
fn main() {
    let dir = data_directory();
    let port = port();
    if std::env::args().any(|a| a == "--headless-api") {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let backend = backend::Backend::open(dir).unwrap_or_else(|e| {
                eprintln!("{}", e.1);
                std::process::exit(1)
            });
            let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
                .await
                .unwrap();
            println!("ScheduGrr Tauri API http://127.0.0.1:{port}");
            axum::serve(listener, backend.router()).await.unwrap();
        });
        return;
    }
    let result=tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,_,_|{if let Some(w)=app.get_webview_window("main"){let _=w.unminimize();let _=w.show();let _=w.set_focus();}}))
        .plugin(tauri_plugin_dialog::init())
        .menu(|app| {
            use tauri::menu::{Menu, MenuItem, Submenu, PredefinedMenuItem};
            let menu = Menu::default(app)?;
            let view = Submenu::with_items(app, "View", true, &[
                &MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?,
                &MenuItem::with_id(app, "force-reload", "Force Reload", true, Some("CmdOrCtrl+Shift+R"))?,
                &PredefinedMenuItem::separator(app)?,
                &MenuItem::with_id(app, "zoom-reset", "Actual Size", true, Some("CmdOrCtrl+0"))?,
                &MenuItem::with_id(app, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+Plus"))?,
                &MenuItem::with_id(app, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?,
                &PredefinedMenuItem::separator(app)?,
                &MenuItem::with_id(app, "fullscreen", "Toggle Full Screen", true, Some("F11"))?,
            ])?;
            // Replace the default macOS View submenu; Windows has no default View.
            #[cfg(target_os = "macos")]
            { if let Some(old) = menu.items()?.get(3) { menu.remove(old)?; } }
            menu.insert(&view, if cfg!(target_os = "macos") { 3 } else { 2 })?;
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            if let Some(window) = app.get_webview_window("main") {
                match event.id().as_ref() {
                    "reload" | "force-reload" => { let _ = window.eval("location.reload()"); }
                    "fullscreen" => { let _ = window.set_fullscreen(!window.is_fullscreen().unwrap_or(false)); }
                    "zoom-reset" | "zoom-in" | "zoom-out" => {
                        let zoom = app.state::<std::sync::Mutex<f64>>();
                        let mut current = zoom.lock().unwrap();
                        *current = match event.id().as_ref() { "zoom-in" => (*current + 0.1).min(3.0), "zoom-out" => (*current - 0.1).max(0.5), _ => 1.0 };
                        let _ = window.set_zoom(*current);
                    }
                    _ => {}
                }
            }
        })
        .manage(std::sync::Mutex::new(1.0_f64))
        .invoke_handler(tauri::generate_handler![export_document])
        .setup(move|app|{
            let listener = match tauri::async_runtime::block_on(tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,port))) {
                Ok(listener) => listener,
                Err(error) => {
                    let message = format!("Cannot open local API port {port}: {error}. Quit the other ScheduGrr instance first.");
                    app.dialog().message(&message).title("ScheduGrr could not start").blocking_show();
                    return Err(std::io::Error::new(error.kind(), message).into());
                }
            };
            let backend=backend::Backend::open(dir.clone()).map_err(|e|std::io::Error::other(e.1))?;
            preferences::migrate(&dir).map_err(|e|std::io::Error::other(e.1))?;
            tauri::async_runtime::spawn(async move{if let Err(e)=axum::serve(listener,backend.router()).await{eprintln!("Local API stopped: {e}")}});
            create_window(app.handle(),&format!("http://127.0.0.1:{port}/?desktop={}",desktop_flavor()),&dir)?;
            Ok(())
        }).build(tauri::generate_context!());
    match result {
        Ok(app) => app.run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                if let Some(w) = _app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        }),
        Err(e) => {
            eprintln!("ScheduGrr could not start: {e}");
            std::process::exit(1)
        }
    }
}
