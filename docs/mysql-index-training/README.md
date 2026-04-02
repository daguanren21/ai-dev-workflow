# MySQL 索引训练营

这是一套面向初学者到进阶开发者的 MySQL 索引训练资料，目标是让你不仅知道“索引是什么”，还能够真正独立分析慢查询、设计索引并识别索引失效场景。

## 文档结构

- `00-outline.md`：课程总览、学习目标、建议节奏
- `01-index-and-bplustree.md`：索引是什么，B+Tree 为什么适合数据库
- `02-primary-vs-secondary-index.md`：主键索引、普通索引、回表
- `03-composite-index-leftmost-prefix.md`：复合索引与最左前缀原则
- `04-covering-index-and-icp.md`：覆盖索引、索引下推与慢查询优化
- `05-explain-in-action.md`：Explain 分析实战
- `06-index-invalid-cases.md`：索引失效场景总结与避坑练习
- `07-explain-exercises.md`：10 道 Explain 练习题
- `08-explain-exercises-answers.md`：10 道 Explain 练习题答案与分析
- `sql/schema-and-seed.sql`：建表、建索引、造数脚本

## 推荐学习顺序

1. 先执行 `sql/schema-and-seed.sql` 准备练习环境。
2. 按顺序阅读 `01` 到 `06` 六节文档。
3. 每节先读原理，再执行对应 SQL，再自己预测是否走索引。
4. 最后完成 `07-explain-exercises.md`，再对照答案。

## 学完后应达到的能力

- 能解释 B+Tree 索引为什么适合数据库。
- 能区分聚簇索引、二级索引、回表、覆盖索引。
- 能根据查询条件判断复合索引是否匹配。
- 能读懂 `EXPLAIN` 的核心字段：`type`、`key`、`rows`、`Extra`。
- 能识别常见索引失效写法，并改写成更合理的 SQL。
- 能为一个慢查询设计出更合适的索引。

## 练习环境建议

- MySQL 8.0+
- 建议单独创建一个测试库，例如 `index_lab`
- 使用 InnoDB 引擎

## 重要提醒

- 索引不是越多越好。索引会带来写入成本、空间成本和维护成本。
- 设计索引时要围绕“查询模式”而不是“字段名直觉”。
- 真正做性能分析时，不要只看“是否走索引”，还要看扫描行数、是否回表、是否排序、是否临时表。
