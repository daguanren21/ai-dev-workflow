# 第 6 节：索引失效场景总结与避坑练习

## 一、这一节的目标

这一节不是罗列知识点，而是帮助你建立一个“写 SQL 时自动避坑”的习惯。

## 二、常见索引失效场景

### 1. 对索引列使用函数

错误写法：

```sql
select *
from orders
where date(create_time) = '2026-02-15';
```

问题：

- `create_time` 上的索引很难直接利用

推荐改写：

```sql
select *
from orders
where create_time >= '2026-02-15 00:00:00'
  and create_time < '2026-02-16 00:00:00';
```

### 2. 对索引列做表达式计算

错误写法：

```sql
select *
from user_profile
where age + 1 = 30;
```

推荐改写：

```sql
select *
from user_profile
where age = 29;
```

### 3. 隐式类型转换

例如 `phone` 是字符串列，但写成：

```sql
select *
from user_profile
where phone = 13800000001;
```

风险：

- 优化器可能无法按预期使用索引

推荐写法：

```sql
select *
from user_profile
where phone = '13800000001';
```

### 4. 复合索引不满足最左前缀

索引：

```sql
(name, age, city)
```

错误期待：

```sql
where age = 28 and city = 'Shanghai'
```

问题：

- 跳过了最左列 `name`

### 5. `like` 以 `%` 开头

错误写法：

```sql
select *
from user_profile
where name like '%100';
```

原因：

- 无法从索引左边界开始定位

更合理的场景是：

```sql
where name like 'user_01%'
```

### 6. `or` 条件导致优化器放弃索引

```sql
select *
from orders
where user_id = 1001 or remark = 'slow order 10';
```

问题：

- 如果两边条件无法同时高效利用索引，优化器可能选择代价更低的全表扫描

### 7. 区分度太低

例如：

```sql
where status = 1
where deleted = 0
```

这类字段取值少，哪怕有索引，也可能收益有限。

### 8. 在范围列后继续指望后续列充分过滤

索引：

```sql
(user_id, status, create_time)
```

查询：

```sql
where user_id > 1000 and status = 1 and create_time >= '2026-02-01'
```

问题：

- 一旦前面出现范围条件，后续列用于继续缩小范围的能力会减弱

## 三、最实用的避坑清单

写 SQL 前先过一遍下面清单：

1. 有没有对索引列做函数或计算？
2. 查询值类型和列类型是否一致？
3. 复合索引是否从最左开始连续匹配？
4. `like` 是否以 `%` 开头？
5. `or` 条件是否把索引利用打散了？
6. 查询是否在低区分度列上做大范围扫描？
7. 是否因为 `select *` 导致大量回表？

## 四、避坑练习

请先判断下列 SQL 是否容易索引失效，再写出更优改法。

### 练习 1

```sql
select * from orders where date(create_time) = '2026-02-18';
```

### 练习 2

```sql
select * from user_profile where age + 1 = 25;
```

### 练习 3

```sql
select * from user_profile where phone = 13800001234;
```

### 练习 4

```sql
select * from user_profile where name like '%888';
```

### 练习 5

```sql
select * from orders where user_id = 1001 or deleted = 1;
```

## 五、参考答案

### 练习 1

改写为：

```sql
select *
from orders
where create_time >= '2026-02-18 00:00:00'
  and create_time < '2026-02-19 00:00:00';
```

### 练习 2

改写为：

```sql
select *
from user_profile
where age = 24;
```

### 练习 3

改写为：

```sql
select *
from user_profile
where phone = '13800001234';
```

### 练习 4

如果业务允许，尽量改成前缀匹配：

```sql
where name like 'user_88%'
```

如果必须做包含匹配，普通 B+Tree 索引帮助有限，应考虑搜索方案或额外设计。

### 练习 5

可以拆成两条查询再合并结果，或重新评估业务逻辑，避免一个 `or` 把高选择性条件和低选择性条件放在一起。

## 六、这一节必须记住的话

- 索引最怕“不能按原始有序结构去查”。
- 对列做函数、计算、错误类型比较，都是在破坏索引使用条件。
- 索引设计和 SQL 写法必须一起优化，不能只改其中一个。
