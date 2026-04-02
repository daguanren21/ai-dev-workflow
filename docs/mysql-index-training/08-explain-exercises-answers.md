# Explain 练习题答案

以下答案是基于配套脚本中的表结构和索引设计给出的分析结论。真实执行时，`rows` 数值和部分优化器选择可能因数据分布略有差异，但总体思路应一致。

## 题 1

```sql
select * from user_profile where id = 1000;
```

参考分析：

- 预计使用索引：`PRIMARY`
- 预计 `type`：`const`
- 回表：否
- 排序：否

原因：

- 主键等值查询
- 主键索引叶子节点直接存整行数据

## 题 2

```sql
select * from user_profile where name = 'user_01000';
```

参考分析：

- 预计使用索引：`idx_name`
- 预计 `type`：`ref`
- 回表：是
- 排序：否

原因：

- `name` 上有普通索引
- `select *` 需要整行数据，通常会回表

## 题 3

```sql
select name, age, city
from user_profile
where name = 'user_01000' and age = 28;
```

参考分析：

- 预计使用索引：`idx_name_age_city`
- 预计 `type`：`ref`
- 回表：大概率否
- 排序：否

原因：

- 满足复合索引最左前两列
- 查询列都在索引中，有机会形成覆盖索引
- `Extra` 可能出现 `Using index`

## 题 4

```sql
select * from user_profile where age = 28 and city = 'Shanghai';
```

参考分析：

- 预计使用索引：可能是 `idx_age`，也可能优化器认为收益一般
- 预计 `type`：`ref` 或更差
- 回表：是
- 排序：否

原因：

- 虽然存在 `(name, age, city)` 复合索引，但不满足最左前缀
- `age` 单列索引可以用，但 `city` 只能继续过滤

## 题 5

```sql
select * from orders where user_id = 300 and status = 2;
```

参考分析：

- 预计使用索引：`idx_user_status_time`
- 预计 `type`：`ref`
- 回表：是
- 排序：否

原因：

- 满足复合索引前两列
- `select *` 仍需要整行数据

## 题 6

```sql
select user_id, status, create_time
from orders
where user_id = 300 and status = 2
order by create_time desc
limit 20;
```

参考分析：

- 预计使用索引：`idx_user_status_time`
- 预计 `type`：`ref`
- 回表：大概率否
- 排序：通常不需要额外 `filesort`

原因：

- 过滤列和排序列顺序与索引匹配
- 查询列都在索引中，可能形成覆盖索引

## 题 7

```sql
select * from orders where status = 2 order by create_time desc limit 20;
```

参考分析：

- 预计使用索引：`idx_status_create_time`
- 预计 `type`：`ref` 或 `range`
- 回表：是
- 排序：通常不需要额外 `filesort`，或比只用单列索引更优

原因：

- `(status, create_time)` 同时照顾过滤和排序
- 但 `select *` 仍需回表

## 题 8

```sql
select * from orders where date(create_time) = '2026-02-15';
```

参考分析：

- 预计使用索引：可能不用，`key` 可能为 `NULL`
- 预计 `type`：`ALL`
- 回表：无意义，先全表扫描
- 排序：否

原因：

- 对索引列使用函数，容易导致索引失效

正确改写：

```sql
select *
from orders
where create_time >= '2026-02-15 00:00:00'
  and create_time < '2026-02-16 00:00:00';
```

## 题 9

```sql
select * from user_profile where name like '%100';
```

参考分析：

- 预计使用索引：通常不用
- 预计 `type`：`ALL`
- 回表：无意义
- 排序：否

原因：

- 前导 `%` 破坏了从索引左边界开始匹配的能力

## 题 10

```sql
select * from orders where user_id = 300 order by amount desc limit 20;
```

参考分析：

- 预计使用索引：`idx_user_id`
- 预计 `type`：`ref`
- 回表：是
- 排序：大概率会出现 `Using filesort`

原因：

- 过滤列和排序列不在同一合理索引顺序中
- 现有索引不能同时高效支持 `where user_id = ?` 和 `order by amount desc`

可能优化：

```sql
create index idx_user_amount on orders(user_id, amount);
```

## 总结

做 Explain 题时，优先判断这四件事：

1. 有没有合适索引
2. 是否满足复合索引顺序
3. 是否需要回表
4. 是否会额外排序

如果你能稳定回答这四个问题，Explain 已经掌握了大半。
