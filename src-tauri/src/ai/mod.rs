pub mod config;
pub mod openai_compatible;
pub mod secret;

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::models::{AiConnectionTestResult, AiPublicConfig, SaveAiConfigInput};

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("无法解析 app_data_dir: {error}"))
}

pub fn get_config(app: &AppHandle) -> Result<AiPublicConfig, String> {
    let data_dir = app_data_dir(app)?;
    let config_path = config::config_path(&data_dir);
    let secret_path = secret::secret_path(&data_dir);

    let mut public = config::read_config_from_path(&config_path)?;
    public.api_key_saved = secret::read_api_key_from_path(&secret_path)?.is_some();
    public.enabled = public.api_key_saved;
    config::write_config_to_path(&config_path, &public)?;
    Ok(public)
}

pub fn save_config(app: &AppHandle, input: SaveAiConfigInput) -> Result<AiPublicConfig, String> {
    let data_dir = app_data_dir(app)?;
    let config_path = config::config_path(&data_dir);
    let secret_path = secret::secret_path(&data_dir);
    let input = config::normalize_save_input(input)?;

    if let Some(api_key) = input.api_key.as_deref() {
        secret::save_api_key_to_path(&secret_path, api_key)?;
    }

    let api_key_saved = if input.api_key.is_some() {
        true
    } else {
        secret::read_api_key_from_path(&secret_path)?.is_some()
    };
    let public = config::public_config_from_input(&input, api_key_saved);
    config::write_config_to_path(&config_path, &public)?;
    Ok(public)
}

pub fn clear_api_key(app: &AppHandle) -> Result<AiPublicConfig, String> {
    let data_dir = app_data_dir(app)?;
    let config_path = config::config_path(&data_dir);
    let secret_path = secret::secret_path(&data_dir);

    secret::clear_api_key_at_path(&secret_path)?;
    let mut public = config::read_config_from_path(&config_path)?;
    public.api_key_saved = false;
    public.enabled = false;
    config::write_config_to_path(&config_path, &public)?;
    Ok(public)
}

pub async fn test_connection(app: &AppHandle) -> Result<AiConnectionTestResult, String> {
    let public = get_config(app)?;
    let data_dir = app_data_dir(app)?;
    let secret_path = secret::secret_path(&data_dir);
    let api_key = match secret::read_api_key_from_path(&secret_path)? {
        Some(api_key) => api_key,
        None => return Ok(openai_compatible::missing_api_key_result()),
    };

    Ok(openai_compatible::test_connection(&public.base_url, &public.model, &api_key).await)
}
