---
name: meeting-minutes
description: |
  会议纪要自动化:接收组会录音转写 / 文本笔记,结构化成"决议 / 行动项 / 待解决问题"
  三栏,行动项批量写回 Gantt 表,纪要全文写入飞书 Doc 并广播群。
  所有数据操作走 @larksuite/openclaw-lark 的原生 `feishu_bitable_app_table_record` /
  `feishu_create_doc` / IM 消息工具,本 skill 只做编排。

  **触发词**: "帮我记组会纪要"、"会议纪要"、"minutes"、"开完会了"、
  "这是今天组会的录音/笔记"、"整理一下刚才的讨论"、"action item"。
---

# 会议纪要 Skill

## 前置:拿数据布局

```
feishu_classmate_data_layout()
  → { app_token, tables: { projects, gantt, ... } }
```

行动项要写到 `Gantt` 表,所以必须拿到 `tables.gantt.table_id` 和 `tables.projects.table_id`。

---

## 场景 A:用户粘贴会议笔记 / 录音转写

### 步骤

1. **抽取原始素材**。用户可能给:
   - 一段纯文本笔记
   - 语音转写(带时间戳)
   - 多人发言的聊天记录截图 OCR 结果

   LLM 自己归一化成纯文本,不调工具。

2. **结构化成三栏**(LLM 做,不调工具):
   ```
   {
     meeting_date: "2026-04-17",
     decisions: [
       { text: "下周 checkpoint 推迟到周五", rationale: "..." },
       ...
     ],
     action_items: [
       {
         owner_open_id: "ou_xxx",   // 或 owner_name 如果没 open_id
         description: "跑完对照组实验 A/B",
         due_date_iso: "2026-04-24",
         related_project_id: "proj_xxx"  // 可空
       },
       ...
     ],
     open_questions: [
       "是否换用新的评估指标?",
       ...
     ]
   }
   ```

3. **消歧人员**。对每个 `owner_name` 没拿到 `open_id` 的行动项:
   ```
   feishu_bitable_app_table_record({
     action: "list",
     app_token, table_id: <projects>,
     field_names: ["owner_open_id","title"]
   })
   ```
   LLM 按名字在历史 Projects 里找常见 owner,找到唯一匹配就用,多匹配/无匹配就用
   `feishu_ask_user_question` 问用户。

4. **向用户确认**。用 `feishu_ask_user_question` 把结构化结果 pretty-print 出来,
   让用户改错或增删,确认通过后再写库。**禁止未确认直接写库**。

5. **批量写 Gantt 行动项**:
   ```
   feishu_bitable_app_table_record({
     action: "batch_create",
     app_token, table_id: <gantt>,
     records: [
       { fields: {
         gantt_id: "g_<ts>_<rand>",
         project_id: "<related_project_id, 可空串>",
         owner_open_id: [{id: "ou_xxx"}],
         milestone: "<description 前 40 字>",
         due_date: <due_date_iso 转毫秒时间戳>,
         progress: 0,
         status: "未开始",
         notes: "来自 <meeting_date> 组会纪要"
       }},
       ...
     ]
   })
   ```
   - `status` 必须严格用 `未开始` / `进行中` / `完成` / `逾期` 之一,写错报 `1254064`。
   - `due_date` 是**毫秒时间戳**(不是秒,不是字符串)。
   - `owner_open_id` 是数组对象 `[{id:"ou_xxx"}]`,不是裸字符串。

6. **生成纪要 markdown**:
   ```
   # 组会纪要 · 2026-04-17

   ## 决议
   1. 下周 checkpoint 推迟到周五
      - 原因:…
   2. …

   ## 行动项
   | Owner | 事项 | 截止 | 相关项目 |
   |---|---|---|---|
   | @张三 | 跑完对照组实验 A/B | 2026-04-24 | proj_xxx |
   | @李四 | … | … | … |

   ## 待解决问题
   - 是否换用新的评估指标?
   - …

   ---
   _本纪要由 feishu-classmate 自动整理,行动项已同步至 Gantt 表。_
   ```

7. **创建纪要 Doc**:
   ```
   feishu_create_doc({
     title: "组会纪要-2026-04-17",
     content_markdown: <上面那段 markdown>
   })
   → { document_id, url }
   ```
   标题前缀 `组会纪要-YYYY-MM-DD` 固定,下游统计脚本依赖此格式。

8. **广播群推送**:
   ```
   {receive_id_type: "chat_id",
    receive_id: "<labInfo.broadcastChatId>",
    msg_type: "text",
    content: {text: "📝 今天组会纪要:<url>\n行动项 N 条已入 Gantt,请各位查收。"}}
   ```

9. **DM 每个 owner**(提醒他查看 Gantt 新节点):
   ```
   {receive_id_type: "open_id", receive_id: "ou_xxx",
    msg_type: "text",
    content: {text: "刚才组会给你派了 <K> 个行动项,已同步到 Gantt,截止最早 <YYYY-MM-DD>。
                     详情:<doc_url>"}}
   ```

---

## 场景 B:用户只想要纪要 Doc,不入 Gantt

触发词中出现 "只记一下" / "不用建任务" / "先别派活"。跳过步骤 5 和 9,其他照旧。

---

## 字段枚举(严格)

| 字段 | 有效值 |
|---|---|
| Gantt.status | `未开始`、`进行中`、`完成`、`逾期` |

时间字段一律**毫秒时间戳**。人员字段一律 `[{id:"ou_xxx"}]` 数组对象。
中文枚举值写错会触发 `1254064 / 1254066` 等 FieldConvFail 错误。

---

## 失败降级

- `feishu_classmate_data_layout` 返回 `app_token` 为空 → 告诉用户"数据库未初始化,
  请联系管理员跑 `openclaw classmate setup-bitable`",中止。
- `feishu_create_doc` 返回 `code 99991672` (缺 `docx:document` scope) →
  降级为把纪要贴成群消息(截断到 1500 字),告诉用户"无 Doc 权限,已直接发群"。
- lark 返回 `code 1254xxx` (字段类型错) → 核对 User 字段 `[{id:...}]`、
  `due_date` 毫秒、`status` 中文枚举,重试一次。
- lark 返回 `code 99991672` 写 Gantt 时 → 只产出 Doc,不写库,告诉用户
  "行动项未入 Gantt,请手动建表"。
- 用户未在步骤 4 确认或回复 "取消" → 中止,Doc 和 Gantt 都不写。
- `labInfo.broadcastChatId` 未配 → 跳过群广播,只创建 Doc + DM owner。
- DM 单个 owner 失败 → 日志警告,不阻塞其他 owner 的 DM。
- 行动项 owner 连 `feishu_ask_user_question` 都问不出 open_id →
  `owner_open_id` 字段留空,`notes` 里记"owner: <名字>",让用户事后手动补。
