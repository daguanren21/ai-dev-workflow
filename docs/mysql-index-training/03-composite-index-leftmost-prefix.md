# 第 3 节：复合索引与最左前缀原则

## 一、这一节的目标

这一节重点让你做到一件事：

> 看一条 SQL，就能初步判断它会不会命中复合索引，以及能利用到哪一部分索引。

## 二、什么是复合索引

复合索引也叫联合索引、多列索引。

例如：

```sql
create index idx_user_status_time on orders(user_id, status, create_time);
```

它不是三个独立索引的简单拼接，而是一个按列顺序组织的整体有序结构。

你可以把它理解成先按 `user_id` 排，再按 `status` 排，最后按 `create_time` 排。

## 三、最左前缀原则是什么

对索引 `(user_id, status, create_time)` 来说，常见匹配情况如下：

| 查询条件 | 是否容易命中索引 | 原因 |
| --- | --- | --- |
| `where user_id = ?` | 是 | 使用最左列 |
| `where user_id = ? and status = ?` | 是 | 连续使用前两列 |
| `where user_id = ? and status = ? and create_time >= ?` | 是 | 连续使用前三列 |
| `where status = ?` | 通常否 | 跳过了最左列 |
| `where create_time >= ?` | 通常否 | 直接使用第三列，不满足最左前缀 |
| `where user_id = ? and create_time >= ?` | 部分可用 | 先用 `user_id`，后续列利用有限 |

一句话记忆：

> 复合索引要从左往右连续使用，不能跳着用。

## 四、为什么列顺序这么重要

因为索引的排序方式是按建索引时的列顺序组织的。

例如 `(a, b, c)` 的顺序，本质上是：

1. 先比较 `a`
2. `a` 相同再比较 `b`
3. `b` 也相同再比较 `c`

所以如果直接查 `b` 或 `c`，数据库很难利用这个索引的有序性快速定位。

## 五、范围查询对后续列的影响

这是复合索引里最容易失分的点。

例如：

```sql
where user_id = 1001
  and status = 1
  and create_time >= '2026-02-01'
```

这条 SQL 很典型，前两列是等值，第三列是范围，通常仍然能比较好地利用索引。

但如果写成：

```sql
where user_id > 1001
  and status = 1
  and create_time = '2026-02-01 10:00:00'
```

一旦前面列已经是范围条件，后面的列在“继续缩小索引扫描范围”这件事上，利用能力会明显下降。

记忆方式：

> 等值匹配越靠前越好；一旦遇到范围，后面列的利用会变弱。

## 六、实战：分析下面 SQL 用哪个索引

表中已有这些索引：

```sql
idx_user_id(user_id)
idx_status(status)
idx_create_time(create_time)
idx_user_status_time(user_id, status, create_time)
idx_status_create_time(status, create_time)
```

### 例 1

```sql
explain
select * from orders
where user_id = 1001 and status = 1;
```

优先猜测：

- 很可能命中 `idx_user_status_time`

原因：

- 同时满足最左两列

### 例 2

```sql
explain
select * from orders
where status = 1 and create_time >= '2026-02-01';
```

优先猜测：

- 可能命中 `idx_status_create_time`

原因：

- 从 `status` 开始连续匹配到 `create_time`

### 例 3

```sql
explain
select * from orders
where create_time >= '2026-02-01';
```

优先猜测：

- 可能命中 `idx_create_time`
- 很难依赖 `idx_user_status_time`

## 七、设计复合索引时的常见思路

### 1. 高频过滤列放前面

如果大多数查询都先按 `user_id` 查，再按 `status` 过滤，那么：

```sql
(user_id, status, create_time)
```

通常比：

```sql
(status, user_id, create_time)
```

更合理。

### 2. 等值条件优先，范围条件靠后

例如：

```sql
where user_id = ?
  and status = ?
  and create_time >= ?
```

适合索引：

```sql
(user_id, status, create_time)
```

### 3. 把排序列纳入索引顺序

如果经常这样查：

```sql
where user_id = ? and status = ?
order by create_time desc
```

那么 `(user_id, status, create_time)` 往往比只建 `(user_id, status)` 更好。

## 八、这一节必须记住的话

- 复合索引不是多个单列索引拼起来这么简单。
- 最左前缀原则的核心是“从左到右连续匹配”。
- 等值条件越靠前越好，范围条件通常放后面。
- 索引列顺序直接影响查询效果和排序效果。

## 九、练习

执行下面 SQL，并先自己判断会命中哪个索引：

```sql
explain select * from orders where user_id = 88;
explain select * from orders where user_id = 88 and status = 2;
explain select * from orders where status = 2 and create_time >= '2026-02-15';
explain select * from orders where user_id = 88 and create_time >= '2026-02-15';
```

练习要求：

1. 写出你预测的索引名。
2. 写出你认为能利用到索引的哪些列。
3. 执行 Explain 验证。
