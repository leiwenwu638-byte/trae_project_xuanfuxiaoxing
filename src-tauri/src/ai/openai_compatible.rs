use std::time::Duration;

use serde_json::{json, Value};

use crate::models::AiConnectionTestResult;

pub fn chat_completions_url(base_url: &str) -> String {
    format!("{}/chat/completions", base_url.trim().trim_end_matches('/'))
}

pub fn build_connection_test_body(model: &str) -> Value {
    json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a connection test assistant."
            },
            {
                "role": "user",
                "content": "Reply with OK."
            }
        ],
        "temperature": 0,
        "max_tokens": 8,
        "stream": false
    })
}

pub fn missing_api_key_result() -> AiConnectionTestResult {
    AiConnectionTestResult {
        ok: false,
        message: "未配置 API Key".to_string(),
    }
}

pub async fn test_connection(base_url: &str, model: &str, api_key: &str) -> AiConnectionTestResult {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return AiConnectionTestResult {
                ok: false,
                message: format!("网络客户端初始化失败: {error}"),
            };
        }
    };

    let response = client
        .post(chat_completions_url(base_url))
        .bearer_auth(api_key)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&build_connection_test_body(model))
        .send()
        .await;

    let response = match response {
        Ok(response) => response,
        Err(error) => {
            return AiConnectionTestResult {
                ok: false,
                message: format!("网络连接失败或 Base URL 不正确: {error}"),
            };
        }
    };

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let message = if status.as_u16() == 401 || status.as_u16() == 403 {
            "API Key 无效或没有权限".to_string()
        } else if status.as_u16() == 404 {
            "Base URL 或模型名称可能不正确".to_string()
        } else if body.trim().is_empty() {
            format!("服务商返回错误: HTTP {status}")
        } else {
            format!(
                "服务商返回错误: HTTP {status} - {}",
                trim_for_message(&body)
            )
        };
        return AiConnectionTestResult { ok: false, message };
    }

    match response.json::<Value>().await {
        Ok(value) if has_choices(&value) => AiConnectionTestResult {
            ok: true,
            message: "连接成功".to_string(),
        },
        Ok(_) => AiConnectionTestResult {
            ok: false,
            message: "服务商响应格式异常，未找到 choices".to_string(),
        },
        Err(error) => AiConnectionTestResult {
            ok: false,
            message: format!("服务商响应解析失败: {error}"),
        },
    }
}

fn has_choices(value: &Value) -> bool {
    value
        .get("choices")
        .and_then(Value::as_array)
        .map(|choices| !choices.is_empty())
        .unwrap_or(false)
}

fn trim_for_message(body: &str) -> String {
    let compact = body.split_whitespace().collect::<Vec<_>>().join(" ");
    compact.chars().take(240).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_completions_url_trims_trailing_slash() {
        assert_eq!(
            chat_completions_url("https://api.example.test/v1/"),
            "https://api.example.test/v1/chat/completions"
        );
    }

    #[test]
    fn connection_test_body_has_expected_openai_compatible_shape() {
        let body = build_connection_test_body("test-model");

        assert_eq!(body["model"], "test-model");
        assert_eq!(body["temperature"], 0);
        assert_eq!(body["max_tokens"], 8);
        assert_eq!(body["stream"], false);
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["content"], "Reply with OK.");
    }

    #[test]
    fn choices_array_proves_successful_response() {
        let response = json!({
            "choices": [
                { "message": { "content": "OK" } }
            ]
        });
        assert!(has_choices(&response));
        assert!(!has_choices(&json!({ "choices": [] })));
    }

    #[test]
    fn missing_api_key_message_is_clear() {
        let result = missing_api_key_result();
        assert!(!result.ok);
        assert_eq!(result.message, "未配置 API Key");
    }
}
