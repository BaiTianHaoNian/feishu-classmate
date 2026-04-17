---
name: training-run-tracker
description: |
  记录每一次 RL/ML 训练实验,包含算法、超参、tracker 链接(W&B / TensorBoard)和最终指标。
  所有 bitable 操作走 @larksuite/openclaw-lark 的原生 `feishu_bitable_app_table_record`,
  本 skill 只负责对话流程、结构化抽取与字段校验。

  **触发词**: "记一下这次训练"、"new run"、"start experiment"、"开跑 PPO"、
  "记一下实验"、学生粘贴 W&B / TensorBoard / wandb.ai / tensorboard.dev 链接。
---

# 训练实验记录 Skill

## 前置:拿数据布局

```
feishu_classmate_data_layout()
  → { app_token, tables: { ..., training_runs? } }
```

如果 `tables.training_runs` 不存在,告诉学生"`TrainingRuns` 表未初始化,请管理员按下面 `## 需要新建的多维表` 段手动建表",然后退出。

---

## 需要新建的多维表

(Admin 手动执行一次,skill 本身不建表。)

### Table: TrainingRuns

| field | type | notes |
|---|---|---|
| run_id | 1 (Text) | 主键,形如 `run_<ts>_<rand>` |
| project_id | 1 (Text) | FK → Projects.project_id,字符串关联 |
| student_open_id | 11 (User) | 实验发起人 |
| algorithm | 3 (SingleSelect) | options: `PPO`/`SAC`/`GRPO`/`DQN`/`DDPG`/`其他` |
| env_name | 1 (Text) | e.g. `HalfCheetah-v4`, `PickCube` |
| commit_hash | 1 (Text) | 代码 commit,短 hash 7~12 位 |
| seed | 2 (Number) | formatter `'0'` |
| hyperparams_json | 1 (Text) | long text,JSON.stringify 后的超参 |
| wandb_url | 15 (Url) | W&B run 链接 |
| tb_url | 15 (Url) | TensorBoard / tensorboard.dev 链接 |
| final_reward | 2 (Number) | formatter `'0.00'` |
| best_reward | 2 (Number) | formatter `'0.00'` |
| status | 3 (SingleSelect) | options: `训练中`/`完成`/`失败`/`中断` |
| started_at | 5 (DateTime) | `yyyy-MM-dd HH:mm` |
| completed_at | 5 (DateTime) | `yyyy-MM-dd HH:mm` |
| gpu_hours | 2 (Number) | formatter `'0.0'` |

### 示例建表调用

```
feishu_bitable_app_table({
  action: "create",
  app_token: <layout.app_token>,
  name: "TrainingRuns",
  default_view_name: "全部实验",
  fields: [
    { field_name: "run_id",            type: 1 },
    { field_name: "project_id",        type: 1 },
    { field_name: "student_open_id",   type: 11 },
    { field_name: "algorithm",         type: 3,
      property: { options: [
        { name: "PPO", color: 0 }, { name: "SAC", color: 2 },
        { name: "GRPO", color: 3 }, { name: "DQN", color: 4 },
        { name: "DDPG", color: 5 }, { name: "其他", color: 7 }
      ]}},
    { field_name: "env_name",          type: 1 },
    { field_name: "commit_hash",       type: 1 },
    { field_name: "seed",              type: 2, property: { formatter: "0" } },
    { field_name: "hyperparams_json",  type: 1 },
    { field_name: "wandb_url",         type: 15 },
    { field_name: "tb_url",            type: 15 },
    { field_name: "final_reward",      type: 2, property: { formatter: "0.00" } },
    { field_name: "best_reward",       type: 2, property: { formatter: "0.00" } },
    { field_name: "status",            type: 3,
      property: { options: [
        { name: "训练中", color: 2 }, { name: "完成", color: 4 },
        { name: "失败", color: 1 }, { name: "中断", color: 7 }
      ]}},
    { field_name: "started_at",        type: 5, property: { date_formatter: "yyyy-MM-dd HH:mm" } },
    { field_name: "completed_at",      type: 5, property: { date_formatter: "yyyy-MM-dd HH:mm" } },
    { field_name: "gpu_hours",         type: 2, property: { formatter: "0.0" } }
  ]
})
```

---

## 场景 A:开跑新实验(登记 run)

示例: `记一下这次训练:PPO 跑 HalfCheetah,seed 42,lr=3e-4,wandb.ai/lab/proj/runs/abc`

### 步骤

1. **确认所属项目**:如果学生没说 project_id,`feishu_bitable_app_table_record({ action: "list", table_id: <projects> })` 列出他自己的项目,让他选(`feishu_ask_user_question`)。
2. **结构化抽取**(LLM 自做,不调 tool):
   ```
   { algorithm, env_name, commit_hash, seed,
     hyperparams: {...}, wandb_url, tb_url }
   ```
   - `algorithm` 必须归一化到枚举值之一,否则用 `其他`
   - `commit_hash` 若学生没给,提示 `git rev-parse --short HEAD`
3. **写 TrainingRuns**:
   ```
   feishu_bitable_app_table_record({
     action: "create",
     app_token, table_id: <training_runs>,
     fields: {
       run_id: "run_<Date.now()>_<rand6>",
       project_id: "<确认后的 project_id>",
       student_open_id: [{ id: "<学生 open_id>" }],
       algorithm: "PPO",
       env_name: "HalfCheetah-v4",
       commit_hash: "a1b2c3d",
       seed: 42,
       hyperparams_json: JSON.stringify({ lr: 3e-4, batch: 64, ... }),
       wandb_url: "https://wandb.ai/...",
       tb_url: "",
       status: "训练中",
       started_at: Date.now()
     }
   })
   ```
4. 回复学生 `run_id` + 提醒"跑完回来说 `<run_id> 完成,reward=...`"。

> **背景 cron 提醒(未实现,仅说明)**: 未来可由一个 `training-run-sweeper` 定时任务扫 `status=训练中` 且 `started_at` 超过 48h 的 run,主动在 IM 里 ping 学生更新 `final_reward` / `completed_at`。

---

## 场景 B:训练结束回填指标

示例: `run_1734... 完成了,final=8450 best=8920 gpu_hours=12.5`

1. **定位 record_id**:
   ```
   feishu_bitable_app_table_record({
     action: "list",
     filter: "CurrentValue.[run_id]=\"run_1734...\""
   })
   ```
2. **update**:
   ```
   fields: {
     status: "完成",          // 或 "失败" / "中断"
     final_reward: 8450,
     best_reward: 8920,
     gpu_hours: 12.5,
     completed_at: Date.now()
   }
   ```
3. 回复"已归档 ✅,下一步可以 `保存这个 checkpoint` 把最好权重归档"(引导到 robot-checkpoint skill)。

---

## 场景 C:查询学生的训练历史

`我最近跑了哪些 PPO?`

```
feishu_bitable_app_table_record({
  action: "list",
  filter: "AND(CurrentValue.[student_open_id]=[{\"id\":\"ou_xxx\"}], CurrentValue.[algorithm]=\"PPO\")",
  field_names: ["run_id","env_name","final_reward","best_reward","status","started_at"]
})
```

输出 markdown 表格,按 `started_at` 倒序,≤ 10 行。

---

## 枚举值强约束

| 字段 | 有效值 |
|---|---|
| algorithm | `PPO`、`SAC`、`GRPO`、`DQN`、`DDPG`、`其他` |
| status | `训练中`、`完成`、`失败`、`中断` |

写错会报 `FieldConvFail`(code 125406X),LLM 自查后用正确值重试一次。

---

## 失败降级

- `tables.training_runs` 不存在 → 引导 admin 按上面建表段手动建表
- 学生给的 wandb_url 不是 http(s) 开头 → 先校正再写,否则 Url 字段会报错
- `code 99991672`(缺 scope) → "权限不足,请 admin 联系"
- 如果 `hyperparams_json` 超过 bitable 文本长度上限,截断到前 20 KB 并在末尾加 `...[truncated]`
