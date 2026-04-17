---
name: one-on-one-scheduler
description: |
  导师与学生 1:1 会议的提议 → 预约 → 准备 → 复盘全流程。
  时间协商走 @larksuite/openclaw-lark 的 `feishu_calendar_freebusy` 和 `feishu_calendar_event`,
  议程生成聚合 Gantt / Submissions / ToolTrace 数据,再写飞书 Doc。

  **触发词**: "约学生 1:1"、"schedule 1on1"、"下周见面谈"、"约 <学生> 聊聊"、
  "/1on1 <学生>"、"1on1 准备"。
---

# 1:1 会议调度与准备 Skill

## 前置:拿数据布局

```
feishu_classmate_data_layout()
  → { app_token, tables: { projects, gantt, submissions, one_on_ones, tool_trace?, ... }, docs: {...} }
```

如 `tables.one_on_ones` 不存在 → 先提示跑 `setup-bitable`(见下)。

---

## 需要新建的多维表

### OneOnOnes 表(声明式 — 由 setup.ts 的并行 agent 建)

| 字段 | 类型 | 说明 |
|---|---|---|
| `meeting_id` | Text (主键) | `1on1_<timestamp>_<rand>` |
| `supervisor_open_id` | User | 导师 |
| `student_open_id` | User | 学生 |
| `scheduled_at` | DateTime | 约定时间(毫秒) |
| `doc_token` | Url | 议程 Doc 链接 |
| `attended` | Checkbox | 是否实际到会 |
| `summary_md` | Text (long) | 会后纪要 Markdown |
| `action_items_json` | Text (long) | 行动项 JSON:`[{owner,task,due}]` |
| `created_at` | DateTime | 创建时间(毫秒) |

---

## 场景 A:提议时间 + 创建日程

示例: `帮我约 张三 下周三下午`

### 步骤

1. **解析 + 补全**:
   - `张三` → open_id(同 supervisor-task-assign 场景 A 步骤 2)
   - "下周三下午" → 候选时间窗 `YYYY-MM-DD 13:00 ~ 18:00` ISO 8601

2. **查双方忙闲**:
   ```
   feishu_calendar_freebusy({
     action: "list",
     time_min: "2026-04-22 13:00:00",
     time_max: "2026-04-22 18:00:00",
     user_ids: ["<导师 ou>", "<学生 ou>"]
   })
   ```

3. **挑 2-3 个空闲槽**(每个 30 分钟),用 `feishu_ask_user_question` 给导师选:
   ```
   这几个时间双方都有空:
   1. 2026-04-22 14:00 - 14:30
   2. 2026-04-22 15:30 - 16:00
   3. 2026-04-22 16:30 - 17:00
   回复 1/2/3 确认,或说"都不合适"重选。
   ```

4. **创建日程**(`feishu_calendar_event` action=create):
   ```
   {
     action: "create",
     summary: "1on1 · <导师名> × <学生名>",
     description: "每周 1:1 同步,议程由 agent 提前 24h 自动生成并 DM。",
     start_time: "2026-04-22 14:00:00",
     end_time: "2026-04-22 14:30:00",
     user_open_id: "<导师 ou>",       // 🚨 必须传 SenderId
     attendees: [
       { type: "user", id: "<学生 ou>" }
     ]
   }
   ```
   - ⚠️ 时间格式:ISO 8601 或 `YYYY-MM-DD HH:mm:ss`,时区 Asia/Shanghai
   - `user_open_id` 必传 — 否则导师自己不在参会人列表中
   - 默认 `attendee_ability: "can_modify_event"`(工具自带)

5. **写 OneOnOnes 表**(占位,doc_token 先空):
   ```
   feishu_bitable_app_table_record({
     action: "create",
     table_id: <one_on_ones>,
     fields: {
       meeting_id: "1on1_<Date.now()>_<rand>",
       supervisor_open_id: [{ id: "<导师 ou>" }],
       student_open_id: [{ id: "<学生 ou>" }],
       scheduled_at: <毫秒>,
       doc_token: "",
       attended: false,
       summary_md: "",
       action_items_json: "[]",
       created_at: Date.now()
     }
   })
   ```

6. **回复导师**: "已约 @学生 2026-04-22 14:00,会前 24h 我会自动整理 agenda 并 DM 你。"

---

## 场景 B:会前 24h 自动准备(cron 或手动触发 "准备 1on1")

### 步骤

1. **找待准备的会议**:
   ```
   feishu_bitable_app_table_record({
     action: "list",
     table_id: <one_on_ones>,
     filter: "AND(CurrentValue.[scheduled_at]><Date.now()+24*3600_000>, CurrentValue.[scheduled_at]<<Date.now()+25*3600_000>, CurrentValue.[doc_token]=\"\")"
   })
   ```

2. **并行**聚合该学生近 1 周数据:
   - **Gantt 进度**: `filter: "AND(CurrentValue.[owner_open_id]=[{\"id\":\"<学生>\"}], CurrentValue.[due_date]>=<一周前>)"`
   - **在投论文**: `filter: "CurrentValue.[author_open_ids]=[{\"id\":\"<学生>\"}]"`
   - **ToolTrace**(若表存在): 该学生近 7 天工具调用频次 Top-5,用于判断活跃度
   - **(可选)Assignments**: 该学生 `status=卡住` 或 `status=待接收` 超 3 天的任务

3. **LLM 合成 agenda**:
   ```markdown
   # 1on1 · <导师> × <学生> · 2026-04-22 14:00

   ## 📈 本周进度 Highlights
   - ✅ 完成《PPO baseline》· 2026-04-15
   - 🚧 进行中《消融实验》· 60%

   ## 🔴 Blockers / 卡点
   - 《数据清洗》逾期 3 天 · 学生备注 "数据不一致,需要 discuss"

   ## 📝 论文状态
   - 《XXX》· NeurIPS 2026 · 审稿中

   ## 💡 建议讨论话题
   1. 数据清洗的口径对齐 — 看是否要和 @李四 同步 schema
   2. PPO baseline 下一步是 scale up 还是做 ablation?
   3. 职业发展:实习 / 继续读博 / 论文方向

   ## ☑️ 会前准备
   - 学生请准备:数据不一致的具体 case 2-3 个
   - 导师请准备:下周算力分配决定
   ```

4. **写 Doc**:
   ```
   feishu_create_doc({
     title: "1on1-<学生名>-<YYYY-MM-DD>",
     content_md: <上面的 markdown>
   })
   ```
   拿到 `doc_token`。

5. **回写 OneOnOnes**:
   ```
   feishu_bitable_app_table_record({
     action: "update",
     record_id: <对应会议 record_id>,
     fields: { doc_token: "<doc url>" }
   })
   ```

6. **DM 导师 + 学生**:
   - 导师: "📋 明天 14:00 和 @张三 的 1:1 agenda 已备好: <doc url>"
   - 学生: "📋 明天 14:00 和导师 1:1,议程: <doc url> · 请提前过一遍"

---

## 场景 C:会后复盘

导师会后说 `1on1 纪要` 或 `/1on1 minutes <meeting_id>`:

1. 调 `meeting-minutes` skill 采集纪要(参考并行 agent 的那个 skill)
2. 回写 OneOnOnes:
   ```
   fields: {
     attended: true,
     summary_md: "<纪要 md>",
     action_items_json: "[{\"owner\":\"ou_zhang\",\"task\":\"补数据对齐 doc\",\"due\":1714000000000}]"
   }
   ```
3. action_items 中每条 → 可选自动调 `supervisor-task-assign` 派单

---

## 时间与时区规则

- 所有 ISO 时间带 `+08:00`(Asia/Shanghai)
- 忙闲查询 `user_ids` 限 1-10 人,会议室暂不查
- 默认会议时长 30 分钟,导师可在提议时说"聊 1 小时"改成 60 分钟
- 周末不自动提议(导师显式说"周六" / "周日"除外)

---

## 失败降级

- `tables.one_on_ones` 不存在 → 回复"1:1 表未建,请管理员跑 `openclaw classmate setup-bitable`",停止
- `freebusy` 查询无共同空闲 → 提示"这个时间窗双方都满,要不要放到下下周?",给下一周候选
- `feishu_calendar_event create` 返回 code 99991672 → 权限不足,引导导师授权 calendar scope
- `feishu_create_doc` 失败 → agenda 直接以纯 markdown 文本 DM,不阻塞会议;OneOnOnes.doc_token 留空
- `user_open_id` 未传 → calendar 工具虽然能建日程但导师不在参会人列表 → 必须补传重试
- ToolTrace 表不存在或查询失败 → agenda 里省略"活跃度"分析,其余 section 照常生成
