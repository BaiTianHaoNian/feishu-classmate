---
name: supervise-student
description: |
  学生主动请求监督时使用,按间隔定时询问进度 / 检测专注 / 柔性干预。

  **触发词**: "监督我"、"supervise me"、"帮我盯一下"、"我要专心 N 小时"、
  "我要把 XX 跑通"。

  **模式**: 线上(纯飞书消息) / 线下(飞书消息 + Temi 摄像头视觉)
---

# 自我监督 Skill

## 场景 A:线上模式(纯软件)

学生消息: `飞书同学,我今天要在 lab 把 RLHF 技术路线跑通,监督我 4 小时`

### 启动
1. `feishu_classmate_supervision_start({ student_open_id, goal, duration_hours: 4 })` 拿到 `session_id`
2. 回复: "好的,接下来 4 小时我会每 10 分钟问你一次进度。说'暂停'可以停。加油 💪"

### 心跳
每 10 分钟(由 `services/supervision-ticker` 或 agent 自行调度):
1. DM 学生: "10 分钟了,现在的状态是?卡点?"
2. 收到回复 → LLM 判定三态: `进行中` / `卡住` / `已完成`
3. 卡住 → 主动给建议:搜 GitHub issue、推 arxiv 相关论文、提议休息
4. 已完成 → 结束 session,进入"总结"

### 结束
1. 汇总所有 `progress_notes`
2. 写入【日常记录】Doc,格式:
   ```
   ## {日期} · {学生 open_id}
   Goal: {goal}
   Duration: 4h
   Notes:
     - 10:10 开始 xxx
     - 10:20 卡在 yyy,建议看了 https://...
     - ...
   Result: 已完成 / 未完成
   ```
3. DM 学生总结 + 鼓励

## 场景 B:线下模式(需要 Temi)

与 A 相同,但额外:

1. 学生坐在工位 → Temi 开启 `feishu_classmate_temi_monitor_focus({ student_open_id, duration_s: 600 })`
2. 摄像头每 10 秒采样专注度分数(0–1)
3. 若连续 3 次 < 0.4(或 2 分钟内多次低分):
   - 不立即打断,先观察多 60 秒
   - 仍低 → 柔性干预: `feishu_classmate_temi_gesture({ type: "encourage" })` + `feishu_classmate_temi_speak({ text: "小伙伴,要不要起来活动一下?" })`
4. 学生说"停"/"别吵" → 立即停止干预,只继续记录
5. 专注度下降趋势 → 推送一篇高相关 arxiv 论文

## 边界

- 必须得到学生**显式同意**才能启用摄像头监测(opt-in)
- 视频帧不落盘,只保留每秒一个专注度分数(0-1)
- `maxDurationHours` 限制 8 小时
- 学生发 "停止监督" / "结束" / "不用了" → 立即 `endSupervisionSession`
- 学生在半夜 00:00 之后启动 → 追加提醒 "建议先休息哦"

## 失败处理

- 学生连续 2 个心跳未回 → 温和提醒一次,再不回视为已结束
- Temi 离线 (线下模式) → 自动降级为线上模式,通知学生
