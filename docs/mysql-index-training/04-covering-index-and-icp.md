# 第 4 节：覆盖索引与索引下推

## 一、这一节要解决什么问题

很多人知道“查询走索引了”，但依然不知道为什么还是慢。原因之一是：

- 虽然走了索引，但回表很多

这一节重点理解两个优化点：

- 覆盖索引
- 索引下推

## 二、什么是覆盖索引

如果一个查询所需的列，全部都能从索引中拿到，就不需要回表。

这就是覆盖索引。

例如有索引：

```sql
create index idx_user_status_time on orders(user_id, status, create_time);
```

下面 SQL：

```sql
select user_id, status, create_time
from orders
where user_id = 1001 and status = 1;
```

查询列和过滤列都在这个索引里，所以数据库可能直接在索引叶子节点返回结果，不需要再去主键索引取整行。

Explain 中常见表现：

- `Extra` 出现 `Using index`

## 三、覆盖索引为什么快

因为它少了一步：

- 不需要回表

这意味着：

- 减少随机 IO
- 减少数据页访问
- 大结果集时收益明显

## 四、什么是索引下推

索引下推是 MySQL 在使用索引扫描时，尽量在索引层就多过滤一部分数据，减少回表次数。

例如索引：

```sql
(user_id, status, create_time)
```

查询：

```sql
select *
from orders
where user_id = 1001
  and status = 1
  and create_time >= '2026-02-01';
```

数据库先通过索引定位到 `user_id = 1001` 的一段范围后，可以继续在索引层判断后续条件，尽量把不满足条件的记录提前过滤掉。

Explain 中常见表现：

- `Extra` 出现 `Using index condition`

## 五、`Using index` 和 `Using index condition` 的区别

这是高频混淆点。

### `Using index`

- 通常表示覆盖索引
- 查询列都在索引里
- 不一定需要回表

### `Using index condition`

- 表示使用了索引下推
- 在索引层先过滤一部分记录
- 仍然可能需要回表

一句话区别：

> `Using index` 更偏向“结果可以直接从索引取”；`Using index condition` 更偏向“先用索引多过滤一点再回表”。

## 六、实战：优化一个慢查询

假设慢查询如下：

```sql
select user_id, status, create_time
from orders
where user_id = 1001 and status = 1
order by create_time desc
limit 20;
```

如果只有单列索引：

```sql
idx_user_id(user_id)
idx_status(status)
```

问题会是：

- 过滤条件可能需要回表
- 排序不一定能顺着索引完成
- 可能额外 `filesort`

更合理的索引通常是：

```sql
create index idx_user_status_time on orders(user_id, status, create_time);
```

这样好处有三个：

1. 过滤条件连续命中索引
2. 排序列在索引后部，便于利用索引顺序
3. 查询列都在索引里，有机会形成覆盖索引

## 七、如何判断要不要追求覆盖索引

优先考虑以下场景：

- 高频查询
- 大结果集查询
- 分页列表查询
- 明显存在大量回表的场景

但不要为了追求覆盖索引，把几十个字段全塞进索引里。那样会导致：

- 索引变宽
- 写入更慢
- 空间更大

## 八、这一节必须记住的话

- 覆盖索引的核心价值是减少回表。
- 索引下推的核心价值是减少无效回表。
- `Using index` 和 `Using index condition` 不是一回事。
- 优化慢查询时，别只看“走索引”，要看是否回表、是否排序、是否临时表。

## 九、动手实验

```sql
explain
select user_id, status, create_time
from orders
where user_id = 1001 and status = 1;

explain
select *
from orders
where user_id = 1001 and status = 1 and create_time >= '2026-02-01';
```

观察：

- 第一条更容易出现什么 `Extra`
- 第二条为什么即使走索引，也可能仍然需要回表

## 十、课后题

1. 为什么 `select *` 通常不利于覆盖索引？
2. 覆盖索引是不是一定优于普通索引？
3. `Using index condition` 能否等同于“不回表”？
