use std::sync::Mutex;
use std::time::Duration;

use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Clone, Serialize, Deserialize)]
struct ApiInfo {
    port: u16,
    token: String,
}

#[derive(Default)]
struct ApiSidecar {
    info: Mutex<Option<ApiInfo>>,
    error: Mutex<Option<String>>,
    child: Mutex<Option<CommandChild>>,
}

#[tauri::command]
fn secret_get(service: String, account: String) -> Result<Option<String>, String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
fn secret_set(service: String, account: String, password: String) -> Result<(), String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.set_password(&password).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_delete(service: String, account: String) -> Result<(), String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

/// `None` in `tauri dev`: the Vite dev server already serves `/api`.
#[tauri::command]
async fn api_info(state: tauri::State<'_, ApiSidecar>) -> Result<Option<ApiInfo>, String> {
    if tauri::is_dev() {
        return Ok(None);
    }
    for _ in 0..300 {
        if let Some(info) = state.info.lock().unwrap().clone() {
            return Ok(Some(info));
        }
        if let Some(error) = state.error.lock().unwrap().clone() {
            return Err(error);
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    Err("Sentinel API did not start in 15s".into())
}

fn spawn_api(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let script = app
        .path()
        .resolve("resources/server/sentinel-api.mjs", BaseDirectory::Resource)?;
    let data_dir = app.path().app_data_dir()?;
    let (mut rx, child) = app
        .shell()
        .sidecar("node")?
        .arg(script)
        .env("SENTINEL_DATA_DIR", data_dir)
        .spawn()?;
    *app.state::<ApiSidecar>().child.lock().unwrap() = Some(child);

    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            let state = handle.state::<ApiSidecar>();
            match event {
                CommandEvent::Stdout(line) => {
                    let line = String::from_utf8_lossy(&line);
                    if let Some(json) = line.trim().strip_prefix("SENTINEL_READY ") {
                        *state.info.lock().unwrap() = serde_json::from_str(json).ok();
                    }
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[sentinel-api] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    *state.error.lock().unwrap() =
                        Some(format!("Sentinel API exited (code {:?})", payload.code));
                }
                _ => {}
            }
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ApiSidecar::default())
        .setup(|app| {
            if !tauri::is_dev() {
                spawn_api(app)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            secret_get,
            secret_set,
            secret_delete,
            api_info
        ])
        .build(tauri::generate_context!())
        .expect("error while running Sentinel")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(child) = app.state::<ApiSidecar>().child.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
