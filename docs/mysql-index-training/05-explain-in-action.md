# 第 5 节：Explain 分析实战

## 一、这一节的目标

这一节不是教你背 Explain 字段，而是教你用 Explain 形成稳定分析动作。

你至少要做到：

1. 看懂一条 SQL 是否在合理使用索引
2. 看懂扫描行数大不大
3. 看懂是否有额外排序或临时表
4. 能提出下一步优化方向

## 二、Explain 最值得先看的 4 个字段

### 1. `type`

表示访问类型，粗略从好到差常见如下：

```text
const > eq_ref > ref > range > index > ALL
```

记忆重点：

- `const`：主键或唯一索引等值匹配，通常很好
- `ref`：普通索引等值匹配，常见且通常不错
- `range`：范围查询
- `index`：扫描整个索引
- `ALL`：全表扫描，通常最差

### 2. `key`

实际使用了哪个索引。

注意：

- 有 `possible_keys` 不代表一定会用
- 真正看的是 `key`

### 3. `rows`

优化器预估要扫描多少行。

这不是精确值，但非常重要：

- 行数越大，问题通常越明显
- 一个查询是否高效，常常先看它扫描了多少

### 4. `Extra`

这是最有信息量的字段之一，常见值：

- `Using where`
- `Using index`
- `Using index condition`
- `Using filesort`
- `Using temporary`

其中需要特别关注：

- `Using filesort`：额外排序
- `Using temporary`：临时表，常见于复杂排序或分组

## 三、Explain 的正确阅读顺序

建议每次按这个顺序读：

1. `key`：到底用了哪个索引
2. `type`：访问方式是否合理
3. `rows`：扫描量大不大
4. `Extra`：是否回表、是否排序、是否临时表

不要一上来只盯着 `type`。

## 四、案例 1：理想查询

```sql
explain
select user_id, status, create_time
from orders
where user_id = 1001 and status = 1;
```

可能观察到的特点：

- `key = idx_user_status_time`
- `type = ref`
- `rows` 较小
- `Extra = Using index`

分析思路：

- 复合索引命中前两列
- 查询列都在索引里
- 有覆盖索引收益

## 五、案例 2：看似走索引，但不够理想

```sql
explain
select *
from orders
where status = 1;
```

可能特点：

- `key = idx_status`
- `type = ref`
- `rows` 很大

分析思路：

- 虽然走了索引，但 `status` 区分度很低
- 结果集可能很大
- 回表次数也可能很多

结论：

- “走索引”不等于“高性能”

## 六、案例 3：出现 `Using filesort`

```sql
explain
select *
from orders
where user_id = 1001
order by amount desc
limit 20;
```

可能特点：

- `key = idx_user_id`
- `Extra = Using filesort`

原因：

- 过滤用的是 `user_id`
- 排序列是 `amount`
- 现有索引顺序不能直接支持排序

优化方向：

- 如果这是高频查询，可考虑新索引 `(user_id, amount)`

## 七、案例 4：全表扫描

```sql
explain
select *
from user_profile
where age + 1 = 30;
```

可能特点：

- `type = ALL`
- `key = NULL`

原因：

- 对索引列做了表达式计算
- 索引失效

改写：

```sql
select *
from user_profile
where age = 29;
```

## 八、Explain 实战方法论

每次看到慢 SQL，先问自己四个问题：

1. 过滤条件有没有合适索引？
2. 过滤是否满足复合索引顺序？
3. 排序或分组是否能利用索引顺序？
4. 是否存在回表太多、扫描太多、排序太多的问题？

然后再决定是：

- 改 SQL
- 改索引
- 改查询字段

## 九、常见错误分析方式

### 错误 1：只要看到 `key` 不为空就觉得没问题

不对。还要看：

- `rows` 大不大
- `Extra` 有没有 `Using filesort`

### 错误 2：只盯着 `type`

不对。`type = ref` 也可能扫很多行。

### 错误 3：只会加索引，不会删索引

不对。冗余索引和低价值索引会拖慢写入，并增加维护成本。

## 十、这一节必须记住的话

- `key` 看实际用哪个索引。
- `rows` 看扫描成本。
- `Extra` 看额外操作。
- `Using filesort`、`Using temporary` 往往是重点排查对象。
- 真正的优化不是“让 SQL 走索引”，而是“让 SQL 以更小代价完成目标”。

## 十一、动手练习

```sql
explain select * from orders where user_id = 300 and status = 2;
explain select * from orders where status = 2 order by create_time desc limit 20;
explain select * from orders where user_id = 300 order by amount desc limit 20;
explain select * from user_profile where city = 'Shanghai' and age = 28;
```

请对每条 SQL 写下：

1. 实际使用的索引
2. 扫描行数大概会不会大
3. 是否可能有排序开销
4. 如果要优化，你优先改什么
