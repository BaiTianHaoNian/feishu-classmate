---
name: evolve-telemetry
description: |
  自我进化 Phase 1 — 工具遥测查询。每次 `feishu_classmate_*` 工具调用会自动
  写入 `ToolTrace` 多维表格(由 index.ts 的 after_tool_call 钩子落表),本 skill
  告诉 agent 如何用 lark 原生 bitable 工具从这张表中读出:
  周度工具使用统计、失败最多的工具、每个 skill 的成功率。

  这张表是 Phase 2 "自我进化(自动)" 的 ground truth:将来 agent 会根据这些
  数据自我总结哪些 skill 频繁失败、哪些工具从没被调用、哪些参数模式容易报错,
  据此重写 SKILL.md 或提议新的 wrapper。

  **触发词**: "工具统计"、"这周用了多少工具"、"哪些工具在失败"、"成功率"、
  "tool trace"、"usage stats"、"telemetry"、"飞书同学干了什么"、
  "自我进化数据"、"Phase 2 可以进化什么了"。
---

# 自我进化遥测 Skill

## 背景:为什么有这张表

PDF §基础功能 最后一行写的是 "自我进化(待补充)"。Phase 1 的可执行交付就是
**先把数据收集起来**——不收数据就无从谈进化。

实现:`index.ts` 里 `api.on('after_tool_call', ...)` 钩子中,每次 toolName
以 `feishu_classmate_` 开头的调用结束后,都会 fire-and-forget 地写一行到
`ToolTrace` 多维表格。写失败不会影响原工具返回。

## 表结构

`tables.tool_trace`,字段如下(严格按此顺序解析):

| field_name | type | 说明 |
|---|---|---|
| trace_id | 1 (Text) | 主键,`tr_<ts>_<rand>` |
| tool_name | 1 (Text) | 例如 `feishu_classmate_temi_speak` |
| session_key | 1 (Text) | OpenClaw session key,跨工具串联 |
| caller_open_id | 11 (User) | `[{id:"ou_xxx"}]`,可能为空数组 |
| params_json | 1 (Text) | 工具入参的 JSON 字符串,最长 8KB,超出截断 |
| ok | 7 (Checkbox) | `true` 表示无错误 |
| error | 1 (Text) | 错误信息,`ok=true` 时为空串 |
| duration_ms | 2 (Number) | 工具执行耗时,毫秒 |
| started_at | 5 (DateTime) | 毫秒时间戳 |

## 前置:拿 table_id

```
feishu_classmate_data_layout()
  → { app_token, tables: { ..., tool_trace: { table_id } } }
```

**若 `tables.tool_trace` 缺失**:钩子是空转的(没有 table_id 就直接跳过),
此时表里还没有数据。提示 admin 跑一次 `/classmate setup-bitable`,
setup 逻辑会按 `ALL_TABLES` 把 `ToolTrace` 表创出来。

## 场景 A:周度工具使用统计

用户:"这周飞书同学调了哪些工具,调了多少次?"

### 步骤

1. 计算本周起点(例如 2026-W16 的周一 00:00 的毫秒时间戳):
   `weekStart = <周一 00:00 毫秒>`
2. 拉本周所有 trace:
   ```
   feishu_bitable_app_table_record({
     action: "list",
     app_token: <layout.app_token>,
     table_id: <layout.tables.tool_trace.table_id>,
     filter: {
       conjunction: "and",
       conditions: [
         { field_name: "started_at", operator: "isGreater", value: ["<weekStart>"] }
       ]
     },
     field_names: ["tool_name","ok","duration_ms","started_at"],
     page_size: 500
   })
   ```
   如果返回超过 500 条,走 page_token 翻页。
3. 按 `tool_name` 分组计数,排序输出,格式:
   ```
   ## 飞书同学 · 本周工具调用 (2026-W16, 共 N 次)
   - feishu_classmate_temi_speak — 42 次 (成功率 100%, 中位耗时 230ms)
   - feishu_classmate_supervision_start — 11 次 (成功率 91%, 中位耗时 45ms)
   - feishu_classmate_temi_navigate_to — 9 次 (成功率 78%, 中位耗时 3.4s)
   ...
   ```

## 场景 B:找出最容易失败的工具

用户:"最近哪些工具在报错?"

### 步骤

1. 过滤 `ok=false` 的最近 7 天记录:
   ```
   filter: {
     conjunction: "and",
     conditions: [
       { field_name: "ok", operator: "is", value: ["false"] },
       { field_name: "started_at", operator: "isGreater", value: ["<now-7d ms>"] }
     ]
   }
   ```
2. 按 `tool_name` + `error` 的前 120 字符分组聚合
3. 输出 Top 5 最频繁的 (tool_name, error_prefix, count),附一条典型的
   `params_json` 片段帮助定位
4. 若发现某个工具 **失败率 > 30%** 且调用次数 ≥ 10 → 高亮标红,建议人工介入

## 场景 C:按 skill 算成功率

SKILL.md 并非直接映射到 tool_name,但 tool_name 的前缀能猜:

| tool_name 前缀 | 归属 skill |
|---|---|
| `feishu_classmate_temi_*` | conduct-lab-tour / supervise-student |
| `feishu_classmate_supervision_*` | supervise-student |
| `feishu_classmate_research_*` | idle-research |
| `feishu_classmate_data_layout` | (共用) |
| `feishu_classmate_chat_*` | initiate-conversation |

### 步骤

1. 按上表把 trace 分桶
2. 每桶算 `ok / total` 作为该 skill 的"工具层成功率"
3. 输出:
   ```
   ## 本周各 Skill 工具层成功率
   - conduct-lab-tour: 94% (53 / 56)
   - supervise-student: 87% (47 / 54)
   - idle-research: 100% (8 / 8)
   ...
   ```
4. **不等于 skill 端到端成功率**——单个 skill 里某次工具失败可能被降级逻辑
   优雅兜住。把这个 caveat 告诉用户。

## 场景 D:Phase 2 自我进化的输入

用户:"根据 ToolTrace 告诉我哪些 skill 可以进化了"

这是 Phase 2 的雏形。按以下启发式输出建议:

1. **高失败率 skill** → 建议 agent 重读该 SKILL.md,补失败降级分支
2. **高耗时 tool**(p95 > 10s)→ 建议考虑异步化或增加超时提醒
3. **从未被调用的 tool** → 可能 SKILL.md 没提到它 / agent 从未触发该分支 →
   建议添加触发词或补用例
4. **params_json 出现相同错误模式** → 建议在 SKILL.md 的"字段枚举(严格)"
   章节里加反例

输出只是**建议**,不要自动改别的 SKILL.md——Phase 2 完整实现里才做自动改写,
并且一定要走人工 review。

## 查询约束

- 永远**先过滤时间窗**再拉,`ToolTrace` 会线性增长,全表 scan 很慢
- `page_size` ≤ 500,超过了走翻页
- `params_json` 字段可能含敏感内容(学生 open_id、项目名),输出给用户前
  只打印前 200 字符摘要,不要原样复读
- 不要把 `caller_open_id` 明文贴给第三方,只用于后台聚合

## 写入这张表是谁的事

**不是本 skill 的事**。本 skill 只读。

写入由 `index.ts` 的 `after_tool_call` 钩子自动完成,fire-and-forget,
失败会被吞掉只在 debug 日志留痕。如果你看到 `ToolTrace` 表一直是空的:
1. 确认 `feishu_classmate_*` 开头的工具确实被调过
2. 确认 `/classmate setup-bitable` 已跑过(`tool_trace` 的 table_id 已落库)
3. 查 plugin 日志里 `tool_trace write skipped` / `tool_trace write threw`
   开头的 debug 行

## 失败降级

- `data_layout` 返回 `tool_trace` 为 undefined → 提示 admin 跑 setup,中止
- lark `code 99991672` (bitable 读权限不足) → 提示"bitable 权限不足,
  Phase 1 遥测暂时只能在日志里看",中止
- 时间范围内 0 条记录 → 不要报错,正常输出"本周暂无工具调用记录"
