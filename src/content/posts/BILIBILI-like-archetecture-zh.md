---
title: "BILIBILI点赞架构"
description: "挣扎的一年"
published: 2025-04-22
updated: 2025-10-01
tags:
  - develop
lang: zh
abbrlink: bilibililike
---
## 系统压力

### 流量压力

##### 全局流量压力

* 写流量
  * 可以做聚合，比如聚合10s内的点赞数，一次性写入减少IO
  * DB写入做异步化（MQ等）
* 每一次更新点赞数据前检查之前的点赞状态，因为取消点赞需要之前没有点赞，反之相同

##### 单点流量压力

* 热门稿件事件
  * DB热点，缓存热点。要有热点识别机制识别，并将数据缓存到本地，并设置合理的TTL

### 数据存储压力

* KV化存储

### 容灾压力

* DB宕机
* Redis集群抖动
* 机房故障
* 网络故障

## 系统架构

![img](https://i0.hdslb.com/bfs/article/758b2b4bef2f3dd719ef82ccf3bf077f9331d7e4.png)

### 三级数据存储层

#### DB-TiDB

* TiDB是分布式的就不用分库分表了
* 点赞记录表
* 点赞count表

#### Cache

* 使用cacheAside
* ```javascript
  key-value = user:likes:patten:{mid}:{business_id} - member(messageID)-score(likeTimestamp)
  ```
* 直接使用zset，维护最大长度，淘汰最早点赞的消息

#### 本地缓存

* 应对缓存热点
* 最小堆算法，在可配置的时间窗口内，统计处访问最频繁的缓存key，并将热Key（Value）按照业务可接受的TTL存储在本地内存中

#### 数据迁移归档

* 从TiDB迁移到KV（Taishan）数据库，节约成本

### 点赞服务层

#### 存储容灾（DB、redis）

* 两地机房互为灾备
  * 机房A所有写+部分读
  * 机房B部分读
* DB故障，使用db-proxy(sidecar)切换读写流量到备用机房
* 异地缓存一致性通过异步任务消费TiDB的binlog维护。可以在需要时切换机房来保证服务，而不会导致大量冷数据回源数据库（冷数据指redis中没有的，需要到DB查的）

#### 服务容灾

* 多层数据存储互为灾备
* redis->kv->DB
* 点赞操作每一层都无限重试

#### 异步任务层

* 点赞数据写入、刷新缓存、为下游其他服务（推荐系统等）发送点赞/点赞数消息
* binlog断流的容灾
  * 先对binlog进行监控
  * 通过业务服务提前透底时间的备用消息，job检测到binlog异常就自动切换fallback消费流。

TODO：

* 缓存策略。以及更新我的点赞/收藏操作

# Reference

[【点个赞吧】 - B站千亿级点赞系统服务架构设计 - 哔哩哔哩](https://www.bilibili.com/read/cv21576373/?opus_fallback=1)