use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use std::collections::HashMap;
use tauri::Manager;

#[cfg(target_os = "macos")]
use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

#[derive(serde::Serialize)]
struct NativeHttpResult {
    status: u16,
    body: String,
    headers: HashMap<String, String>,
}

#[tauri::command]
async fn oauth_post_form(
    url: String,
    body: String,
    headers: HashMap<String, String>,
) -> Result<NativeHttpResult, String> {
    let client = reqwest::Client::new();
    let mut request = client.post(&url).body(body);

    if !headers.is_empty() {
        let mut header_map = HeaderMap::new();
        for (name, value) in headers {
            let header_name = HeaderName::from_bytes(name.as_bytes())
                .map_err(|error| format!("invalid header name `{name}`: {error}"))?;
            let header_value = HeaderValue::from_str(&value)
                .map_err(|error| format!("invalid header value for `{name}`: {error}"))?;
            header_map.insert(header_name, header_value);
        }
        request = request.headers(header_map);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;
    let status = response.status().as_u16();

    let mut response_headers = HashMap::new();
    for (name, value) in response.headers() {
        if let Ok(value) = value.to_str() {
            response_headers.insert(name.to_string(), value.to_string());
        }
    }

    let body = response
        .text()
        .await
        .map_err(|error| format!("failed to read response body: {error}"))?;

    Ok(NativeHttpResult {
        status,
        body,
        headers: response_headers,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![oauth_post_form])
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(target_os = "macos")]
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = configure_fullscreen_auxiliary_behavior(&main_window);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "macos")]
fn configure_fullscreen_auxiliary_behavior(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let window_for_closure = window.clone();
    window.run_on_main_thread(move || {
        let Ok(ns_window_ptr) = window_for_closure.ns_window() else {
            return;
        };

        let ns_window: &NSWindow = unsafe { &*ns_window_ptr.cast() };
        let mut behavior = ns_window.collectionBehavior();
        behavior |= NSWindowCollectionBehavior::FullScreenAuxiliary;
        behavior |= NSWindowCollectionBehavior::MoveToActiveSpace;
        ns_window.setCollectionBehavior(behavior);
    })
}
