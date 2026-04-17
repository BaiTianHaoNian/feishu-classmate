---
name: robot-checkpoint
description: |
  机器人策略 checkpoint 归档、元数据注释、A/B 对比与部署状态跟踪。
  所有 bitable 操作走 @larksuite/openclaw-lark 原生 `feishu_bitable_app_table_record`。
  本 skill 只做对话编排、metric 对比呈现与业务校验。

  **触发词**: "保存这个 checkpoint"、"归档权重"、"compare policy X vs Y"、
  "比较 ckpt_v2 和 ckpt_v3"、"deploy v3 checkpoint"、"上生产"、"标记废弃"。
---

# 策略 Checkpoint Skill

## 前置:拿数据布局

```
feishu_classmate_data_layout()
  → { app_token, tables: { ..., checkpoints?, training_runs? } }
```

若 `tables.checkpoints` 不存在 → 引导管理员按下面 `## 需要新建的多维表` 手动建表。

---

## 需要新建的多维表

### Table: Checkpoints

| field | type | notes |
|---|---|---|
| ckpt_id | 1 (Text) | 主键,`ckpt_<ts>_<rand>` |
| run_id | 1 (Text) | FK → TrainingRuns.run_id |
| tag | 1 (Text) | 语义 tag,e.g. `v1.2.3-best`、`stage2-nightly` |
| artifact_url | 15 (Url) | S3/OSS/本地路径链接 |
| eval_env | 1 (Text) | 评测环境名 |
| success_rate | 2 (Number) | formatter `'0.00%'` (0~1 之间的小数) |
| avg_reward | 2 (Number) | formatter `'0.00'` |
| evaluated_on_real | 7 (Checkbox) | 是否在真机上测过 |
| deploy_status | 3 (SingleSelect) | options: `开发`/`测试`/`生产`/`已废弃` |
| notes | 1 (Text) | 自由备注 |
| saved_at | 5 (DateTime) | `yyyy-MM-dd HH:mm` |

### 示例建表调用

```
feishu_bitable_app_table({
  action: "create",
  app_token: <layout.app_token>,
  name: "Checkpoints",
  default_view_name: "全部权重",
  fields: [
    { field_name: "ckpt_id",           type: 1 },
    { field_name: "run_id",            type: 1 },
    { field_name: "tag",               type: 1 },
    { field_name: "artifact_url",      type: 15 },
    { field_name: "eval_env",          type: 1 },
    { field_name: "success_rate",      type: 2, property: { formatter: "0.00%" } },
    { field_name: "avg_reward",        type: 2, property: { formatter: "0.00" } },
    { field_name: "evaluated_on_real", type: 7 },
    { field_name: "deploy_status",     type: 3,
      property: { options: [
        { name: "开发", color: 0 }, { name: "测试", color: 2 },
        { name: "生产", color: 4 }, { name: "已废弃", color: 1 }
      ]}},
    { field_name: "notes",             type: 1 },
    { field_name: "saved_at",          type: 5, property: { date_formatter: "yyyy-MM-dd HH:mm" } }
  ]
})
```

---

## 场景 A:归档一个 checkpoint

示例: `保存这个 checkpoint: run_17340... tag=v1.2-best, s3://bucket/ckpt/best.pt, success=0.87, reward=842`

### 步骤

1. **校验 run_id 存在**(否则就是野 checkpoint,拒绝):
   ```
   feishu_bitable_app_table_record({
     action: "list", table_id: <training_runs>,
     filter: "CurrentValue.[run_id]=\"run_17340...\""
   })
   ```
2. 若 0 条 → 告诉学生"找不到该 run,先跑 training-run-tracker 登记"。
3. 追问缺失字段:`eval_env`、`evaluated_on_real`(布尔),若没给 `deploy_status` 默认 `开发`。
4. **create Checkpoints**:
   ```
   feishu_bitable_app_table_record({
     action: "create",
     app_token, table_id: <checkpoints>,
     fields: {
       ckpt_id: "ckpt_<Date.now()>_<rand6>",
       run_id: "run_17340...",
       tag: "v1.2-best",
       artifact_url: "https://s3.../best.pt",  // 必须 http(s) 前缀
       eval_env: "PickCube-real",
       success_rate: 0.87,
       avg_reward: 842,
       evaluated_on_real: false,
       deploy_status: "开发",
       notes: "<学生原话>",
       saved_at: Date.now()
     }
   })
   ```
5. 回复 `ckpt_id` + 建议下一步(A/B 对比 / 升级到测试)。

---

## 场景 B:A/B 对比两个 checkpoint

示例: `比较 ckpt_v2 和 ckpt_v3` 或 `compare policy ckpt_17... vs ckpt_18...`

### 步骤

1. **分别拉两个 row**(两次 list 或一次 OR filter):
   ```
   feishu_bitable_app_table_record({
     action: "list",
     filter: "OR(CurrentValue.[ckpt_id]=\"ckpt_v2\", CurrentValue.[ckpt_id]=\"ckpt_v3\")",
     field_names: ["ckpt_id","tag","eval_env","success_rate","avg_reward",
                   "evaluated_on_real","deploy_status","saved_at"]
   })
   ```
2. 若只拿到 1 条 → 报错"找不到 ckpt_xxx"并退出。
3. **警告不可比**:若两条 `eval_env` 不同,先警告学生"评测环境不同,对比仅供参考",继续。
4. **输出 markdown 对比表**(Agent 本地拼,不调 tool):

   | metric | ckpt_v2 | ckpt_v3 | winner |
   |---|---|---|---|
   | success_rate | 0.82 | 0.87 | **ckpt_v3** ↑ |
   | avg_reward | 812 | 842 | **ckpt_v3** ↑ |
   | evaluated_on_real | ❌ | ✅ | ckpt_v3 |
   | deploy_status | 开发 | 测试 | — |
   | saved_at | ... | ... | — |

5. 末尾给一句结论: "ckpt_v3 在 2/2 主指标占优,建议推到测试/生产"。
6. **如果学生追一句 `上生产`** → 进入场景 C。

---

## 场景 C:更新部署状态

示例: `deploy ckpt_v3 到生产` / `ckpt_v2 废弃`

### 步骤

1. **定位 record_id**: `list` + `filter: "CurrentValue.[ckpt_id]=\"ckpt_v3\""`
2. **业务规则**:
   - 推到 `生产` 前必须 `evaluated_on_real == true`,否则反问"还没真机验证过,确定 force 上生产吗?",学生明确确认才继续。
   - 同一 `eval_env` 已有 `deploy_status=生产` 的 ckpt → 先把它降级为 `已废弃`(避免多生产版本):
     ```
     filter: "AND(CurrentValue.[eval_env]=\"...\", CurrentValue.[deploy_status]=\"生产\")"
     → 对每条 update { deploy_status: "已废弃" }
     ```
3. **update 目标 ckpt**:
   ```
   fields: { deploy_status: "生产", notes: "<追加部署时间戳>" }
   ```
4. 回复 + 建议在广播群通知团队。

---

## 枚举值强约束

| 字段 | 有效值 |
|---|---|
| deploy_status | `开发`、`测试`、`生产`、`已废弃` |
| evaluated_on_real | `true` / `false`(Checkbox) |

`success_rate` 一律存 `0~1` 之间的小数(bitable formatter 显示为百分比)。学生若给 `87%` / `87`,统一归一化到 `0.87`。

---

## 失败降级

- `tables.checkpoints` 不存在 → 引导 admin 建表
- `artifact_url` 不是 http(s) / s3 开头 → 提示学生补全前缀(bitable Url 字段要求 http(s))。如果学生坚持本地路径,退而求其次存到 `notes`,`artifact_url` 留空
- A/B 对比两条都不存在 → 列出该学生最近 5 个 ckpt 让他选
- `code 1254xxx` 枚举错 → 自查 `deploy_status` 表,重试一次
