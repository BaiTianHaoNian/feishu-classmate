---
name: skill-tree
description: |
  给每位实验室成员维护技能标签树(ROS / PyTorch / RL / MuJoCo / …),
  支持自报、他人验证、按技能查人。为 `mentor-dispatch` 提供匹配底表。
  所有 bitable 操作走 @larksuite/openclaw-lark 的
  `feishu_bitable_app_table_record`,本 skill 只编排对话和校验 preset 标签。

  **触发词**: "我会 xxx"、"record my skills"、"登记技能"、
  "谁会 ROS"、"who can help with MuJoCo"、"+1 xxx 的 yyy"、
  "这个月我学会了 xxx"。
---

# Skill Tree Skill

## 前置:总是先拿数据布局

```
feishu_classmate_data_layout()
  → { app_token, tables: { ..., skill_tree, projects } }
```

---

## 需要新建的多维表

### SkillTree

| 字段 | 类型 | 说明 |
|---|---|---|
| entry_id | Text (pk) | `st_<ts>_<rand>` |
| student_open_id | User | 该技能的所属人 |
| skill_tag | MultiSelect | **PRESET** 见下方 ~50 标签 |
| proficiency | SingleSelect | `入门` / `熟练` / `精通` / `可教` |
| self_reported | Checkbox | true=自报,false=他人登记 |
| verified_by_open_id | User | 验证人(可为空) |
| example_project_id | Text | FK → `Projects.project_id`,证据项目 |
| last_used_at | DateTime | 最近一次使用该技能的时间(毫秒) |
| notes | Text | 备注,如"带过师弟做 XX" |

**中文枚举值强约束**:`proficiency` 只能写 `入门`、`熟练`、`精通`、`可教`。
写错报 `FieldConvFail` (code 125406X)。

### PRESET skill_tag 列表(~50)

```
仿真/平台:     MuJoCo、IsaacGym、PyBullet、Gazebo
机器人中间件:  ROS、ROS2、MoveIt
深度学习框架:  PyTorch、JAX、TF2
学习范式:      RL、IL、Diffusion-Policy
编程语言:      Python、C++、CUDA
基础设施:      Docker、K8s、Slurm
模型描述:      URDF、MJCF
机械设计:      CAD、Fusion360、Solidworks
SLAM:          SLAM、RTABMap、Cartographer
视觉标记:      ArUco、AprilTag
规划/碰撞:     ORCA、FCL
动捕:          OptiTrack、Vicon
通用:          Git、Linux、LaTeX
LLM/VLA:       HuggingFace、OpenVLA、RT-2
感知:          Open3D、PCL、ROS-Perception
```

> preset 标签一经确定,LLM 匹配用户口述时必须就近归一
> (如 "我会 iga/isaacgym" → `IsaacGym`),不得随意新增。
> 新标签需 admin 线下评审再加入 schema,不走运行时动态添加。

---

## 场景 A:自报技能

示例用户消息: `我会 ROS 和 MuJoCo`

### 步骤

1. **LLM 归一到 preset**:`["ROS","MuJoCo"]`(拒绝 `ROS1` 这种非 preset 写法)
2. **用 `feishu_ask_user_question` 逐项确认熟练度**:
   > ROS 你属于:1.入门 2.熟练 3.精通 4.可教(能教别人)?
3. 可选追问"有项目例子吗?"→ 拿 `project_id`
4. **批量写入**:
   ```
   feishu_bitable_app_table_record({
     action: "batch_create",
     app_token, table_id: <skill_tree>,
     records: [
       {
         fields: {
           entry_id: "st_<ts>_<rand>",
           student_open_id: [{ id: "<学生 open_id>" }],
           skill_tag: ["ROS"],
           proficiency: "熟练",
           self_reported: true,
           example_project_id: "<可选>",
           last_used_at: Date.now(),
           notes: ""
         }
       },
       { fields: { ..., skill_tag: ["MuJoCo"], proficiency: "精通" } }
     ]
   })
   ```
5. 回复"已登记 <n> 条技能。同学们的派单靠你了 💪"

---

## 场景 B:按技能查人

示例:`谁会 SLAM?` / `who can help with MuJoCo`

### 步骤

1. LLM 归一到 preset 标签(`SLAM`)
2. 查表:
   ```
   feishu_bitable_app_table_record({
     action: "list",
     app_token, table_id: <skill_tree>,
     filter: "CurrentValue.[skill_tag].contains(\"SLAM\")",
     field_names: ["student_open_id","proficiency","verified_by_open_id","example_project_id"]
   })
   ```
3. **排序**(LLM 侧):`可教 > 精通 > 熟练 > 入门`;同级时 `verified_by_open_id` 非空的优先
4. 格式化输出(前 5 位):
   ```
   SLAM 会的人:
   • @张三 —— 可教 (已验证,项目 proj_xxx)
   • @李四 —— 精通
   • @王五 —— 熟练 (自报)
   ```

---

## 场景 C:验证(+1)

示例:`+1 张三 的 ROS` / `给李四的 MuJoCo 打个确认`

### 步骤

1. LLM 解析出 `{ target: "张三", skill: "ROS" }`;把 `target` 映射到 open_id
   (用 `labInfo.members` 的姓名↔open_id 表;无法映射则问清)
2. 先 list 找到那条记录的 record_id:
   ```
   filter: "AND(CurrentValue.[student_open_id]=[{\"id\":\"ou_xxx\"}], CurrentValue.[skill_tag].contains(\"ROS\"))"
   ```
3. **更新**:
   ```
   action: "update",
   record_id: <那条>,
   fields: {
     verified_by_open_id: [{ id: "<验证人 open_id>" }]
   }
   ```
4. 回复"已验证 @张三 的 ROS 技能 ✅"
5. **自我验证禁止**:若验证人 == `student_open_id`,直接拒绝

---

## 场景 D:月度增量(cron 描述,不负责实现)

**触发**: cron service `skill-tree-monthly` 每月 1 号 10:00 给每位 `labInfo.members` 成员 DM:
> 这个月你学会了什么新东西?(回复 skip 跳过)

收到回复后复用场景 A 流程,新技能走 `create`,旧技能只更新 `last_used_at` 与 `proficiency`。

---

## 失败降级

- 用户口述标签不在 preset → 先归一;实在归不进去,回复
  "`<原词>` 不在 preset 列表,暂不支持登记,要不要先找个相近的?"
  列出 3 个最相近 preset 供挑选,不调任何工具
- lark 返回 `code 99991672`(缺 scope)→ 告知用户权限不足,停止
- lark 返回 `code 1254xxx` → 核对枚举值表(proficiency 必须中文),重试一次
- `data_layout` 无 `skill_tree` 表 → 回复"`SkillTree` 表尚未创建,请管理员合流 schema 后
  跑 setup",流程终止
- `example_project_id` 在 `Projects` 表中不存在 → 写入时留空,不阻塞整条记录
