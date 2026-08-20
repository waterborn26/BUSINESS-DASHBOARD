//! Meridian Tauri shell.
//!
//! Responsibilities kept in Rust deliberately:
//! - SQLite access (tauri-plugin-sql) with migrations from `migrations/`
//! - Secure credential storage in the macOS Keychain (`keyring` crate) —
//!   API tokens never touch the SQLite database or any config file.
//! - Native window/menu integration.

use tauri_plugin_sql::{Migration, MigrationKind};

const KEYCHAIN_SERVICE: &str = "com.waterborn.meridian";

/// Store a connector credential in the macOS Keychain.
#[tauri::command]
fn secret_set(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

/// Read a connector credential. Returns None if absent.
#[tauri::command]
fn secret_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Delete a connector credential (used when a data source is disconnected).
#[tauri::command]
fn secret_delete(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial normalized schema",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:meridian.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![secret_set, secret_get, secret_delete])
        .run(tauri::generate_context!())
        .expect("error while running Meridian");
}
