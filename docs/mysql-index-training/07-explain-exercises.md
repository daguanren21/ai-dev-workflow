# Explain 练习题

使用配套脚本初始化测试数据后，完成以下 10 道题。

要求：

1. 先不要看答案。
2. 先写出你预测的 `key`、`type`、是否会回表、是否会额外排序。
3. 再执行 `EXPLAIN` 验证。

## 题 1

```sql
explain
select *
from user_profile
where id = 1000;
```

## 题 2

```sql
explain
select *
from user_profile
where name = 'user_01000';
```

## 题 3

```sql
explain
select name, age, city
from user_profile
where name = 'user_01000' and age = 28;
```

## 题 4

```sql
explain
select *
from user_profile
where age = 28 and city = 'Shanghai';
```

## 题 5

```sql
explain
select *
from orders
where user_id = 300 and status = 2;
```

## 题 6

```sql
explain
select user_id, status, create_time
from orders
where user_id = 300 and status = 2
order by create_time desc
limit 20;
```

## 题 7

```sql
explain
select *
from orders
where status = 2
order by create_time desc
limit 20;
```

## 题 8

```sql
explain
select *
from orders
where date(create_time) = '2026-02-15';
```

## 题 9

```sql
explain
select *
from user_profile
where name like '%100';
```

## 题 10

```sql
explain
select *
from orders
where user_id = 300
order by amount desc
limit 20;
```

## 建议作答模板

你可以按下面格式记录：

```text
题号：
预测使用索引：
预测访问类型：
是否回表：
是否可能 Using filesort：
原因：
```
