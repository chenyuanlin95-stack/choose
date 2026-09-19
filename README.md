# 二选一

朋友聚会实时站队小游戏的第一版仓库。玩家扫码/房间码加入，随机获得动物头像，必须作答，可附一条「我有话说」。所有人提交后自动揭晓，头像从中央浮动到 A/B 分区，弹幕飞过并保留在讨论区。主控台负责房间、玩家、题库和下一题。

## 当前版本

- React + TypeScript + Vite
- 20 个鲜明动物头像（当前用统一圆形 emoji 原型，后续可替换为自制 SVG，不影响数据结构）
- 玩家端完整 UI demo：加入 → 分配头像 → 大厅 → 答题 → 漂浮等待 → 自动揭晓 → 讨论区
- 主控台：房间二维码、玩家列表（UI 上限20）、题库 CRUD、二选一/排序题数据模型、随机下一题
- Supabase SQL：questions / rooms / players / answers + Realtime
- 当前前端默认使用 demo 数据，因此 clone 后无需 Supabase 就能先看 UI。接入 Supabase 后再把 demo state 替换为 realtime hooks。

## 本地运行

```bash
npm install
npm run dev
```

打开：
- `/` 首页
- `/join/8236` 玩家端 demo
- `/host` 主控台 demo

玩家端大厅有一个仅用于当前原型检查的 `Demo：开始` 小按钮；正式接 Realtime 后删除，由房间状态自动推进。等待页目前用 2.2 秒模拟「最后一人提交」，正式版改为监听 answers 数量。

## Supabase

1. 创建 Supabase 项目。
2. 在 SQL Editor 执行 `supabase/schema.sql`。
3. 复制 `.env.example` 为 `.env.local`，填入 Project URL 与 anon key。
4. 题库数据之后可通过主控台录入，也可以继续补 `seed.sql` 批量导入。

> `schema.sql` 里的 RLS 是方便原型联调的宽松策略。公开部署前，应增加真正的 host token / RPC 权限校验，避免任何客户端都能修改题库或房间。

## GitHub / Vercel 部署

代码可以直接推 GitHub。推荐把仓库导入 Vercel：Framework 选择 Vite，添加 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 两个环境变量即可。GitHub Pages 也能部署，但 BrowserRouter 需要额外 SPA fallback；Vercel 更省事。

## 下一步实现清单

1. 将 demo state 替换为 Supabase Realtime。
2. 房主创建房间并生成4位码；加入时事务式分配未占用的 0–19 头像。
3. Host 开始/下一题更新 `rooms.phase/current_question_id/round`。
4. 玩家提交答案写入 `answers`，提交后不可修改。
5. 客户端监听本轮 answers；`answers count == players count` 时自动将 room phase 更新为 reveal（建议用数据库函数避免多个客户端竞争）。
6. reveal 使用当前已有 Framer Motion 动画，从等待坐标飞向 A/B 分区。
7. ranking 题玩家端加入拖拽排序 UI，揭晓展示平均名次与个人排序。
8. 将 200 道候选题筛选后写入 seed。
9. 将 emoji 头像替换成 20 个项目内 SVG 动物头像。

## 数据模型原则

`questions.type` 当前支持 `binary | ranking`，`options` 为 JSON 数组，因此后续增加多选、打分等题型不需要推翻题库。
