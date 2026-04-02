# 第 2 节：主键索引 vs 普通索引

## 一、这一节的核心

这一节要真正理解三个概念：

- 聚簇索引
- 二级索引
- 回表

这三个点不明白，后面你几乎没法真正分析索引优化。

## 二、主键索引是什么

在 InnoDB 里，主键索引通常就是聚簇索引。

它的特点是：

- 叶子节点直接存整行数据
- 数据行本身按主键顺序组织

例如表：

```sql
create table user_profile (
  id bigint primary key auto_increment,
  name varchar(50) not null,
  age int not null,
  city varchar(50) not null
);
```

主键索引的叶子节点可以理解成：

```text
id=1 -> 整行数据
id=2 -> 整行数据
id=3 -> 整行数据
```

## 三、普通索引是什么

普通索引也叫二级索引。

例如：

```sql
create index idx_name on user_profile(name);
```

它的叶子节点不是整行数据，而是：

```text
name 值 + 对应主键 id
```

也就是说，普通索引查到的往往只是“线索”，不是最终整行数据。

## 四、什么是回表

执行下面 SQL：

```sql
select * from user_profile where name = 'user_01000';
```

如果命中 `idx_name`，过程通常是：

1. 先在 `idx_name` 里找到 `name = 'user_01000'`
2. 拿到对应主键 `id`
3. 再根据 `id` 去主键索引中取整行

第 3 步就是：

- 回表

所以要记住：

- 普通索引查出来不一定能直接返回所有字段
- 查 `select *` 时，回表很常见

## 五、为什么主键索引和普通索引性能不同

### 查询主键

```sql
select * from user_profile where id = 1000;
```

特点：

- 直接走主键索引
- 通常一次定位到整行
- 没有回表

### 查询普通索引列

```sql
select * from user_profile where name = 'user_01000';
```

特点：

- 先查普通索引
- 再回表到主键索引
- 多一次数据访问

## 六、为什么不建议随意使用大宽字段做主键

因为 InnoDB 的二级索引叶子节点存的是“二级索引键 + 主键值”。

如果主键很大，例如 UUID 长字符串：

- 每个二级索引都会更大
- 占更多存储空间
- 缓存命中率更差
- 查询和写入成本都会增加

因此很多业务表更喜欢：

- 自增整型主键
- 雪花 ID 这类较紧凑的数值主键

## 七、实验：观察主键索引和普通索引

```sql
explain select * from user_profile where id = 1000;
explain select * from user_profile where name = 'user_01000';
explain select id, name from user_profile where name = 'user_01000';
```

你要观察：

- `key` 是否分别使用 `PRIMARY` 和 `idx_name`
- `Extra` 是否出现 `Using index`
- 第三条 SQL 是否可能因为只查少量列而减少回表影响

## 八、这一节最容易混淆的点

### 误区 1：主键索引和普通索引都是“存整行”

不对。

- 主键索引叶子节点存整行
- 普通索引叶子节点一般存索引列值和主键值

### 误区 2：走了普通索引就一定很快

不对。

如果回表次数很多，性能仍然可能不理想。

### 误区 3：所有表都必须有业务主键

不对。

从存储结构和维护成本看，通常只需要一个稳定、短小、唯一的主键。

## 九、这一节必须记住的话

- InnoDB 主键索引通常是聚簇索引。
- 普通索引通常是二级索引。
- 二级索引叶子节点一般不存整行，而是存主键值。
- 回表是“通过二级索引拿到主键，再去主键索引取整行”。

## 十、课后练习

1. 为什么 `select *` 更容易产生回表？
2. 为什么大字符串主键会拖慢二级索引？
3. 如果 `select id, name from user_profile where name = 'user_01000'`，和 `select *` 相比，哪条更有机会更快？为什么？
