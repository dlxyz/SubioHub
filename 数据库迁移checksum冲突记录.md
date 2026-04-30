# 数据库迁移 Checksum 冲突记录

## 背景

在将资讯系统接入真实后端路由并执行数据库建表时，发现远端 PostgreSQL 库 `sub2api` 已存在历史迁移记录，且与当前仓库中的部分 migration 文件 checksum 不一致。

## 已确认现象

- 数据库地址：`172.21.244.241:5432`
- 已连接数据库：`sub2api`
- `news_posts` 与 `news_post_translations` 已通过执行 `111_add_news_posts.sql` 手工补入数据库
- 当前后端若直接依赖自动 migration 启动，会在校验阶段被拦截

## 已确认冲突

### 1. `001_init.sql`

- 数据库 checksum：
  - `9ba0369779484625edcea7a7d1d4582397e31546db9149b05004990a3f16c630`
- 当前仓库本地 checksum：
  - `ca02fcfb9125f220bdf579ce92dab508622031a9cce08a1bf6007d8047d943f9`
- 数据库记录时间：
  - `2026-04-20T08:35:05.315434+08:00`

这是当前最直接阻塞后端自动 migration 启动的冲突。

### 2. `054_drop_legacy_cache_columns.sql`

- 数据库 checksum：
  - `82de761156e03876653e7a6a4eee883cd927847036f779b0b9f34c42a8af7a7d`
- 当前仓库本地 checksum：
  - `7aacdd57d1243b48c32ddb1d6d2f24ee262b048509b0104f42dbdba507408481`
- 数据库记录时间：
  - `2026-04-20T08:35:06.192967+08:00`

### 3. `061_add_usage_log_request_type.sql`

- 数据库 checksum：
  - `66207e7aa5dd0429c2e2c0fabdaf79783ff157fa0af2e81adff2ee03790ec65c`
- 当前仓库本地 checksum：
  - `97bdd9a32d921986f74a0231ab90735567a9234fb7062f4d9d1baf108ba59769`
- 数据库记录时间：
  - `2026-04-20T08:35:06.265595+08:00`

## 现阶段判断

- 大概率是数据库最初按另一版 migration 基线初始化，之后仓库内对应 SQL 被改动，但数据库没有同步重建
- 这属于 migration 基线漂移，不适合直接把数据库“回拉到当前 `001` 内容”
- 更稳妥的方向通常是：
  - 找回该库当初执行的原始 migration 基线
  - 或在迁移器中增加针对旧 checksum 的兼容规则
  - 或为现有数据库补充新的前向修正 migration

## 当前临时处理

- 为了优先打通资讯系统，已直接执行：
  - `backend/migrations/111_add_news_posts.sql`
- 结果：
  - `news_posts` 已存在
  - `news_post_translations` 已存在

## 后续待办

1. 复查 `schema_migrations` 全量差异，确认是否只有这 3 个文件存在漂移
2. 评估是否给 `001_init.sql` 增加兼容规则，方式参考：
   - `backend/internal/repository/migrations_runner.go`
3. 判断 `054`、`061` 的兼容规则是否还需要针对当前库补扩
4. 在修复 checksum 问题后，再验证后端能否依赖自动 migration 正常启动
