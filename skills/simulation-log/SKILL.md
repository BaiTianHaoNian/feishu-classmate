---
name: simulation-log
description: |
  仿真实验记录、domain randomization 参数归档、sim-to-real gap 跟踪与可复现性检查。
  所有 bitable 操作走 @larksuite/openclaw-lark 原生 `feishu_bitable_app_table_record`。
  本 skill 负责对话流程、gap 计算、复现校验的编排。

  **触发词**: "sim-real gap"、"仿真结果记一下"、"仿真跑完了"、
  "reproducibility check"、"复现检查"、"跑 3 次同 seed"、
  "MuJoCo 跑完"、"IsaacGym 结果"。
---

# 仿真日志 Skill

## 前置:拿数据布局

```
feishu_classmate_data_layout()
  → { app_token, tables: { ..., sim_runs?, checkpoints? } }
```

若 `tables.sim_runs` 不存在 → 引导 admin 按下面 `## 需要新建的多维表` 手动建表。

---

## 需要新建的多维表

### Table: SimRuns

| field | type | notes |
|---|---|---|
| sim_id | 1 (Text) | 主键,`sim_<ts>_<rand>` |
| ckpt_id | 1 (Text) | FK → Checkpoints.ckpt_id |
| simulator | 3 (SingleSelect) | options: `MuJoCo`/`IsaacGym`/`PyBullet`/`Gazebo`/`RoboSuite`/`其他` |
| domain_rand_json | 1 (Text) | long text,DR 参数 JSON(mass/friction/light ranges 等) |
| physics_params_json | 1 (Text) | long text,物理常量 JSON(g, timestep, solver 等) |
| sim_success_rate | 2 (Number) | formatter `'0.00%'`,0~1 小数 |
| real_success_rate | 2 (Number) | formatter `'0.00%'`,可为空表示未真机测 |
| sim_real_gap_percentage | 2 (Number) | formatter `'0.0'`,Agent 本地算,**不走 bitable formula**,直接写数值(相对差,单位 %) |
| reproduce_command | 1 (Text) | 精确可复现的 shell 命令 |
| findings | 1 (Text) | 结论 / 观察 |
| created_at | 5 (DateTime) | `yyyy-MM-dd HH:mm` |

### 示例建表调用

```
feishu_bitable_app_table({
  action: "create",
  app_token: <layout.app_token>,
  name: "SimRuns",
  default_view_name: "全部仿真",
  fields: [
    { field_name: "sim_id",                  type: 1 },
    { field_name: "ckpt_id",                 type: 1 },
    { field_name: "simulator",               type: 3,
      property: { options: [
        { name: "MuJoCo", color: 0 }, { name: "IsaacGym", color: 2 },
        { name: "PyBullet", color: 3 }, { name: "Gazebo", color: 4 },
        { name: "RoboSuite", color: 5 }, { name: "其他", color: 7 }
      ]}},
    { field_name: "domain_rand_json",        type: 1 },
    { field_name: "physics_params_json",     type: 1 },
    { field_name: "sim_success_rate",        type: 2, property: { formatter: "0.00%" } },
    { field_name: "real_success_rate",       type: 2, property: { formatter: "0.00%" } },
    { field_name: "sim_real_gap_percentage", type: 2, property: { formatter: "0.0" } },
    { field_name: "reproduce_command",       type: 1 },
    { field_name: "findings",                type: 1 },
    { field_name: "created_at",              type: 5, property: { date_formatter: "yyyy-MM-dd HH:mm" } }
  ]
})
```

---

## 场景 A:登记一次仿真实验

示例: `仿真结果记一下: ckpt_v3 在 IsaacGym 上 success=0.92, mass DR ±20%`

### 步骤

1. **校验 ckpt_id**(`list` Checkpoints 表,filter `ckpt_id`)。找不到 → 先去 robot-checkpoint 归档。
2. **引导学生结构化给参数**(LLM 自做):
   - `simulator` 归一化到枚举(`IsaacGym` 写成 `isaacgym` 也要认)
   - `domain_rand_json` 至少记 `mass_range`、`friction_range`、`lighting_range` 三个;没给的默认 `null`
   - `physics_params_json` 记 `timestep`、`solver`、`gravity`
   - `reproduce_command` **必填**,要求学生给**完整**的 `python train.py --cfg ... --seed ... --ckpt ...`
3. **计算 sim-real gap**(Agent 本地,不走 bitable formula):
   ```
   if real_success_rate 非空:
     gap_pct = (sim_success_rate - real_success_rate) / sim_success_rate * 100
   else:
     gap_pct = null
   ```
4. **create SimRuns**:
   ```
   feishu_bitable_app_table_record({
     action: "create",
     app_token, table_id: <sim_runs>,
     fields: {
       sim_id: "sim_<Date.now()>_<rand6>",
       ckpt_id: "ckpt_v3",
       simulator: "IsaacGym",
       domain_rand_json: JSON.stringify({ mass_range: [0.8, 1.2], ... }),
       physics_params_json: JSON.stringify({ timestep: 0.005, solver: "PGS" }),
       sim_success_rate: 0.92,
       real_success_rate: null,
       sim_real_gap_percentage: null,
       reproduce_command: "python train.py --cfg configs/pick.yaml --seed 42 --ckpt ckpt_v3",
       findings: "<学生原话 / LLM 提炼>",
       created_at: Date.now()
     }
   })
   ```

---

## 场景 B:回填真机指标 + gap 分析

示例: `sim_173... 真机测了,real=0.71`

1. **定位 record_id**: `list` + `filter: "CurrentValue.[sim_id]=\"sim_173...\""`
2. 读出 `sim_success_rate`,**计算 gap**:
   ```
   gap_pct = (0.92 - 0.71) / 0.92 * 100 = 22.8
   ```
3. **update**:
   ```
   fields: {
     real_success_rate: 0.71,
     sim_real_gap_percentage: 22.8,
     findings: "<追加: gap 22.8%, 怀疑摩擦系数 DR 不够宽>"
   }
   ```
4. **gap 分析话术**(Agent 回复,不调 tool):
   - gap < 10% → "gap 可接受,可以考虑上真机生产"
   - 10% ≤ gap < 25% → "gap 中等,建议扩大 `friction_range` / `mass_range`,或加 sensor noise DR,再跑一轮"
   - gap ≥ 25% → "gap 过大,很可能是 observation 分布偏移 / reward shaping 过拟合 sim,建议 (1) 打开 image augmentation (2) 检查 real 的 camera intrinsic 是否和 sim 一致 (3) 做 system identification"
   - `real_success_rate` 高于 sim → 反常,优先怀疑 real 评测集太容易,让学生复核

---

## 场景 C:可复现性检查

示例: `reproducibility check sim_173...` / `跑 3 次同 seed 看结果一致吗`

### 步骤

1. 读出原 run 的 `reproduce_command` 和 `physics_params_json`。
2. 指导学生**手动**跑 3 次同 seed:
   ```
   for i in 1 2 3; do
     <reproduce_command>  # 原样复制
   done
   ```
3. 学生回传 3 个 success_rate,Agent 算:
   - mean, std, 最大-最小差值
   - 判定:`std / mean > 5%` → 不可复现,标红
4. **追加到 findings**(update 原 sim_id 行):
   ```
   fields: {
     findings: "<原 findings>\n[repro-check 2026-04-17] 3 次 run: [0.92, 0.91, 0.89], std/mean=1.5%, ✅ 可复现"
   }
   ```
5. 不可复现时的排查清单(Agent 念给学生):
   - PyTorch 是否设置了 `torch.use_deterministic_algorithms(True)`
   - CUDA 是否 `CUBLAS_WORKSPACE_CONFIG=:4096:8`
   - 仿真器的 non-determinism(IsaacGym 多 env 并行默认就不确定)
   - 数据加载是否有随机 shuffle 没 seed

---

## 场景 D:查询某 ckpt 的所有仿真记录

`ckpt_v3 在哪些仿真器跑过?`

```
feishu_bitable_app_table_record({
  action: "list",
  filter: "CurrentValue.[ckpt_id]=\"ckpt_v3\"",
  field_names: ["sim_id","simulator","sim_success_rate","real_success_rate",
                "sim_real_gap_percentage","created_at"]
})
```

输出 markdown 表,按 `created_at` 倒序。

---

## 枚举值强约束

| 字段 | 有效值 |
|---|---|
| simulator | `MuJoCo`、`IsaacGym`、`PyBullet`、`Gazebo`、`RoboSuite`、`其他` |

`sim_success_rate` / `real_success_rate` 存 `0~1` 小数;`sim_real_gap_percentage` 存**百分数值本身**(22.8 而不是 0.228)。

---

## 失败降级

- `tables.sim_runs` 不存在 → 引导 admin 建表
- 学生没给 `reproduce_command` → **强制追问**,这是本表存在的核心价值之一,不能留空
- `domain_rand_json` / `physics_params_json` 超长 → 截断到 20 KB 并加 `...[truncated]`,同时提示学生用 `artifact_url` 存完整配置
- `code 1254xxx` 枚举错 → 重试一次用正确枚举值
- `code 99991672`(缺 scope) → "权限不足,请 admin 联系"
