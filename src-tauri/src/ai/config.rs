use std::fs;
use std::path::{Path, PathBuf};

use crate::models::{AiProviderType, AiPublicConfig, SaveAiConfigInput};

pub const AI_CONFIG_FILE: &str = "ai_config.json";

pub fn config_path(data_dir: &Path) -> PathBuf {
    data_dir.join(AI_CONFIG_FILE)
}

pub fn default_ai_config() -> AiPublicConfig {
    AiPublicConfig {
        enabled: false,
        provider: AiProviderType::Deepseek,
        base_url: "https://api.deepseek.com".to_string(),
        model: "deepseek-v4-flash".to_string(),
        api_key_saved: false,
    }
}

pub fn read_config_from_path(path: &Path) -> Result<AiPublicConfig, String> {
    match fs::read_to_string(path) {
        Ok(content) => {
            serde_json::from_str(&content).map_err(|error| format!("AI 配置文件解析失败: {error}"))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(default_ai_config()),
        Err(error) => Err(format!("读取 AI 配置失败: {error}")),
    }
}

pub fn write_config_to_path(path: &Path, config: &AiPublicConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建 AI 配置目录失败: {error}"))?;
    }
    let body = serde_json::to_string_pretty(config)
        .map_err(|error| format!("序列化 AI 配置失败: {error}"))?;
    fs::write(path, format!("{body}\n")).map_err(|error| format!("写入 AI 配置失败: {error}"))
}

pub fn normalize_save_input(input: SaveAiConfigInput) -> Result<SaveAiConfigInput, String> {
    let base_url = input.base_url.trim().trim_end_matches('/').to_string();
    if base_url.is_empty() {
        return Err("Base URL 不能为空".to_string());
    }

    let model = input.model.trim().to_string();
    if model.is_empty() {
        return Err("模型名称不能为空".to_string());
    }

    let api_key = match input.api_key {
        Some(value) => {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                return Err("API Key 不能为空".to_string());
            }
            Some(trimmed)
        }
        None => None,
    };

    Ok(SaveAiConfigInput {
        provider: input.provider,
        base_url,
        model,
        api_key,
    })
}

pub fn public_config_from_input(input: &SaveAiConfigInput, api_key_saved: bool) -> AiPublicConfig {
    AiPublicConfig {
        enabled: api_key_saved,
        provider: input.provider,
        base_url: input.base_url.clone(),
        model: input.model.clone(),
        api_key_saved,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> SaveAiConfigInput {
        SaveAiConfigInput {
            provider: AiProviderType::Deepseek,
            base_url: " https://api.deepseek.com/ ".to_string(),
            model: " deepseek-v4-flash ".to_string(),
            api_key: None,
        }
    }

    #[test]
    fn provider_legal_values_deserialize() {
        for provider in ["deepseek", "openai", "custom_openai_compatible"] {
            let json = format!(
                r#"{{
                    "provider":"{provider}",
                    "baseUrl":"https://example.test",
                    "model":"model",
                    "apiKey":"test-api-key"
                }}"#
            );
            let parsed: SaveAiConfigInput = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed.base_url, "https://example.test");
        }
    }

    #[test]
    fn provider_illegal_value_is_rejected() {
        let json = r#"{
            "provider":"unknown",
            "baseUrl":"https://example.test",
            "model":"model"
        }"#;
        assert!(serde_json::from_str::<SaveAiConfigInput>(json).is_err());
    }

    #[test]
    fn empty_base_url_is_rejected() {
        let mut value = input();
        value.base_url = " ".to_string();
        assert_eq!(
            normalize_save_input(value).unwrap_err(),
            "Base URL 不能为空"
        );
    }

    #[test]
    fn empty_model_is_rejected() {
        let mut value = input();
        value.model = " ".to_string();
        assert_eq!(normalize_save_input(value).unwrap_err(), "模型名称不能为空");
    }

    #[test]
    fn empty_api_key_is_rejected_when_present() {
        let mut value = input();
        value.api_key = Some(" ".to_string());
        assert_eq!(normalize_save_input(value).unwrap_err(), "API Key 不能为空");
    }

    #[test]
    fn public_config_never_serializes_real_api_key() {
        let mut value = normalize_save_input(input()).unwrap();
        value.api_key = Some("test-api-key".to_string());
        let public = public_config_from_input(&value, true);
        let json = serde_json::to_string(&public).unwrap();
        assert!(json.contains("apiKeySaved"));
        assert!(!json.contains("\"apiKey\":"));
        assert!(!json.contains("test-api-key"));
    }

    #[test]
    fn save_input_with_api_key_marks_public_config_saved() {
        let mut value = normalize_save_input(input()).unwrap();
        value.api_key = Some("test-api-key".to_string());
        let public = public_config_from_input(&value, true);
        assert!(public.enabled);
        assert!(public.api_key_saved);
    }
}
