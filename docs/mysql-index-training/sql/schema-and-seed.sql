create database if not exists index_lab;
use index_lab;

set session cte_max_recursion_depth = 100000;

drop table if exists orders;
drop table if exists user_profile;

create table user_profile (
  id bigint primary key auto_increment,
  name varchar(50) not null,
  age int not null,
  city varchar(50) not null,
  phone varchar(20) not null,
  email varchar(120) not null,
  created_at datetime not null,
  index idx_name(name),
  index idx_age(age),
  index idx_city(city),
  index idx_phone(phone),
  index idx_name_age_city(name, age, city)
) engine = InnoDB;

insert into user_profile (
  name,
  age,
  city,
  phone,
  email,
  created_at
)
with recursive seq as (
  select 1 as n
  union all
  select n + 1 from seq where n < 20000
)
select
  concat('user_', lpad(n, 5, '0')) as name,
  18 + (n % 43) as age,
  elt(1 + (n % 8), 'Beijing', 'Shanghai', 'Shenzhen', 'Hangzhou', 'Guangzhou', 'Chengdu', 'Wuhan', 'Nanjing') as city,
  concat('138', lpad(n, 8, '0')) as phone,
  concat('user_', lpad(n, 5, '0'), '@example.com') as email,
  date_add(
    date_add('2026-01-01 00:00:00', interval (n % 30) day),
    interval ((n * 37) % 86400) second
  ) as created_at
from seq;

create table orders (
  id bigint primary key auto_increment,
  user_id bigint not null,
  status tinyint not null comment '0=created,1=paid,2=shipped,3=completed,4=cancelled',
  pay_channel tinyint not null comment '0=card,1=wechat,2=alipay',
  amount decimal(10, 2) not null,
  create_time datetime not null,
  remark varchar(255) null,
  deleted tinyint not null default 0,
  index idx_user_id(user_id),
  index idx_status(status),
  index idx_create_time(create_time),
  index idx_status_create_time(status, create_time),
  index idx_user_status_time(user_id, status, create_time),
  index idx_deleted(deleted)
) engine = InnoDB;

insert into orders (
  user_id,
  status,
  pay_channel,
  amount,
  create_time,
  remark,
  deleted
)
with recursive seq as (
  select 1 as n
  union all
  select n + 1 from seq where n < 100000
)
select
  1 + ((n * 13) % 20000) as user_id,
  n % 5 as status,
  n % 3 as pay_channel,
  round((((n * 37) % 500000) / 100) + 9.90, 2) as amount,
  date_add(
    date_add('2026-01-01 00:00:00', interval (n % 60) day),
    interval ((n * 17) % 86400) second
  ) as create_time,
  if(n % 10 = 0, concat('slow order ', n), null) as remark,
  if(n % 50 = 0, 1, 0) as deleted
from seq;

analyze table user_profile, orders;
