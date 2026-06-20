use crate::models::AiPlanRequest;

pub fn build_system_prompt() -> String {
    [
        "你是一个桌面学习工作节律助手。",
        "你必须只返回 JSON，不要返回 Markdown，不要解释，不要使用代码块。",
        "你的任务是把用户的自然语言计划拆成 1 到 8 条今日待办草稿。",
    ]
    .join("\n")
}

pub fn build_user_prompt(input: &AiPlanRequest) -> String {
    let existing = if input.existing_todos.is_empty() {
        "无".to_string()
    } else {
        input
            .existing_todos
            .iter()
            .map(|todo| {
                format!(
                    "- title: {}; reminderTime: {}; priority: {:?}; completed: {}",
                    todo.title,
                    todo.reminder_time.as_deref().unwrap_or("null"),
                    todo.priority,
                    todo.completed
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    format!(
        r#"当前日期：{date}
当前时间：{current_time}

用户输入：
{user_input}

已有待办：
{existing}

优先级规则：
- critical：今天必须完成且影响很大。
- high：重要，建议优先安排。
- medium：普通默认优先级。
- low：轻量或可顺延事项。

生成规则：
1. todos 数量必须是 1 到 8 条。
2. title 不超过 40 个中文字符，不能为空。
3. reminderTime 必须是 HH:mm 或 null。
4. 不要安排当前时间之前的提醒时间。
5. priority 只能是 critical、high、medium、low。
6. soundEnabled 默认 true。
7. 不要生成已经存在的待办。
8. 用户没有明确时间时，reminderTime 可以为 null。
9. warnings 用于提示无法安排的内容。
10. 不要输出 Markdown，只输出 JSON。

目标 JSON 格式：
{{
  "summary": "string",
  "todos": [
    {{
      "title": "string",
      "reminderTime": "HH:mm 或 null",
      "priority": "critical | high | medium | low",
      "soundEnabled": true,
      "reason": "string"
    }}
  ],
  "warnings": []
}}"#,
        date = input.date,
        current_time = input.current_time,
        user_input = input.user_input,
        existing = existing
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AiExistingTodo, AiPlanRequest, TodoPriority};

    fn request() -> AiPlanRequest {
        AiPlanRequest {
            user_input: "上午复习 Java，下午完善 README".to_string(),
            date: "2026-06-20".to_string(),
            current_time: "08:30".to_string(),
            existing_todos: vec![AiExistingTodo {
                title: "已有任务".to_string(),
                reminder_time: Some("09:00".to_string()),
                priority: TodoPriority::Medium,
                completed: false,
            }],
        }
    }

    #[test]
    fn prompt_contains_user_input() {
        let prompt = build_user_prompt(&request());
        assert!(prompt.contains("上午复习 Java，下午完善 README"));
    }

    #[test]
    fn prompt_contains_current_date_and_time() {
        let prompt = build_user_prompt(&request());
        assert!(prompt.contains("2026-06-20"));
        assert!(prompt.contains("08:30"));
    }

    #[test]
    fn prompt_contains_existing_todos() {
        let prompt = build_user_prompt(&request());
        assert!(prompt.contains("已有任务"));
        assert!(prompt.contains("09:00"));
    }

    #[test]
    fn prompt_requires_json_only() {
        let system = build_system_prompt();
        let user = build_user_prompt(&request());
        assert!(system.contains("只"));
        assert!(system.contains("JSON"));
        assert!(user.contains("不要输出 Markdown"));
        assert!(user.contains("\"summary\""));
        assert!(user.contains("\"todos\""));
        assert!(user.contains("\"warnings\""));
    }
}
