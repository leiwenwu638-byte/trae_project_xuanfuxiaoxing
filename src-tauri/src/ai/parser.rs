use crate::models::{AiExistingTodo, AiPlanDraft};

pub fn parse_plan_draft(
    content: &str,
    existing_todos: &[AiExistingTodo],
) -> Result<AiPlanDraft, String> {
    let cleaned = strip_json_fence(content);
    let mut draft: AiPlanDraft = serde_json::from_str(cleaned).map_err(|error| {
        format!("模型返回格式异常: priority/reminderTime/title 字段校验失败: {error}")
    })?;
    validate_draft(&mut draft, existing_todos)?;
    Ok(draft)
}

fn strip_json_fence(content: &str) -> &str {
    let trimmed = content.trim();
    if let Some(rest) = trimmed.strip_prefix("```json") {
        return rest.trim().strip_suffix("```").unwrap_or(rest).trim();
    }
    if let Some(rest) = trimmed.strip_prefix("```") {
        return rest.trim().strip_suffix("```").unwrap_or(rest).trim();
    }
    trimmed
}

fn validate_draft(
    draft: &mut AiPlanDraft,
    existing_todos: &[AiExistingTodo],
) -> Result<(), String> {
    if draft.todos.len() > 8 {
        return Err("todos 数量不能超过 8 条".to_string());
    }

    let existing_titles = existing_todos
        .iter()
        .map(|todo| todo.title.trim().to_string())
        .collect::<std::collections::BTreeSet<_>>();
    let mut seen = std::collections::BTreeSet::new();
    let mut valid = Vec::new();

    for todo in draft.todos.drain(..) {
        let title = todo.title.trim();
        if title.is_empty() {
            return Err("title 不能为空".to_string());
        }
        if title.chars().count() > 40 {
            return Err("title 不能超过 40 个中文字符".to_string());
        }
        validate_hhmm(todo.reminder_time.as_deref())?;

        if existing_titles.contains(title) || !seen.insert(title.to_string()) {
            draft.warnings.push(format!("已跳过重复待办：{title}"));
            continue;
        }

        valid.push(todo);
    }

    draft.todos = valid;
    Ok(())
}

fn validate_hhmm(value: Option<&str>) -> Result<(), String> {
    let Some(value) = value else {
        return Ok(());
    };
    let bytes = value.as_bytes();
    if bytes.len() != 5 || bytes[2] != b':' {
        return Err("reminderTime 必须是 HH:mm 或 null".to_string());
    }
    if !bytes[0].is_ascii_digit()
        || !bytes[1].is_ascii_digit()
        || !bytes[3].is_ascii_digit()
        || !bytes[4].is_ascii_digit()
    {
        return Err("reminderTime 必须是 HH:mm 或 null".to_string());
    }
    let h = (bytes[0] - b'0') as u32 * 10 + (bytes[1] - b'0') as u32;
    let m = (bytes[3] - b'0') as u32 * 10 + (bytes[4] - b'0') as u32;
    if h > 23 || m > 59 {
        return Err("reminderTime 必须是合法 HH:mm".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AiExistingTodo, TodoPriority};

    fn existing() -> Vec<AiExistingTodo> {
        vec![AiExistingTodo {
            title: "已有任务".to_string(),
            reminder_time: Some("08:30".to_string()),
            priority: TodoPriority::Medium,
            completed: false,
        }]
    }

    fn valid_json() -> String {
        r#"{
          "summary": "今日建议先做重点任务",
          "todos": [
            {
              "title": "复习 Java",
              "reminderTime": "09:30",
              "priority": "high",
              "soundEnabled": true,
              "reason": "上午适合学习"
            }
          ],
          "warnings": []
        }"#
        .to_string()
    }

    #[test]
    fn parses_plain_json() {
        let draft = parse_plan_draft(&valid_json(), &existing()).unwrap();
        assert_eq!(draft.summary, "今日建议先做重点任务");
        assert_eq!(draft.todos.len(), 1);
        assert_eq!(draft.todos[0].title, "复习 Java");
        assert_eq!(draft.todos[0].reminder_time.as_deref(), Some("09:30"));
        assert_eq!(draft.todos[0].priority, TodoPriority::High);
        assert!(draft.todos[0].sound_enabled);
    }

    #[test]
    fn parses_json_fenced_content() {
        let content = format!("```json\n{}\n```", valid_json());
        let draft = parse_plan_draft(&content, &existing()).unwrap();
        assert_eq!(draft.todos[0].title, "复习 Java");
    }

    #[test]
    fn rejects_invalid_json() {
        let err = parse_plan_draft("not json", &existing()).unwrap_err();
        assert!(err.contains("格式异常"));
    }

    #[test]
    fn rejects_invalid_priority() {
        let json = valid_json().replace("\"high\"", "\"urgent\"");
        let err = parse_plan_draft(&json, &existing()).unwrap_err();
        assert!(err.contains("priority"));
    }

    #[test]
    fn rejects_invalid_reminder_time() {
        let json = valid_json().replace("\"09:30\"", "\"24:00\"");
        let err = parse_plan_draft(&json, &existing()).unwrap_err();
        assert!(err.contains("reminderTime"));
    }

    #[test]
    fn rejects_empty_title() {
        let json = valid_json().replace("\"复习 Java\"", "\"\"");
        let err = parse_plan_draft(&json, &existing()).unwrap_err();
        assert!(err.contains("title"));
    }

    #[test]
    fn rejects_more_than_eight_todos() {
        let todo = r#"{
          "title": "任务",
          "reminderTime": null,
          "priority": "medium",
          "soundEnabled": true,
          "reason": "安排"
        }"#;
        let todos = (0..9).map(|_| todo).collect::<Vec<_>>().join(",");
        let json = format!(
            r#"{{
              "summary": "too many",
              "todos": [{todos}],
              "warnings": []
            }}"#
        );
        let err = parse_plan_draft(&json, &existing()).unwrap_err();
        assert!(err.contains("8"));
    }

    #[test]
    fn filters_duplicate_existing_titles_and_adds_warning() {
        let json = valid_json().replace("\"复习 Java\"", "\"已有任务\"");
        let draft = parse_plan_draft(&json, &existing()).unwrap();
        assert!(draft.todos.is_empty());
        assert!(draft
            .warnings
            .iter()
            .any(|warning| warning.contains("已有任务")));
    }
}
