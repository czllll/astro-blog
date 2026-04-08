---
title: "BILIBILI Like System Architecture"
description: "A quick note on BILIBILI's like system under write-heavy traffic, hot-key pressure, and disaster recovery constraints."
published: 2025-04-22
updated: 2025-10-01
tags:
  - develop
lang: en
abbrlink: bilibililike
---

*This post was translated by LLM.*
## System Pressure

### Traffic Pressure

##### Global Traffic Pressure

* Write traffic
  * Aggregate writes. For example, batch like counts within a 10-second window and flush them in one shot to reduce I/O.
  * Make DB writes asynchronous through MQ or similar infrastructure.
* Before every like-state update, check the previous like state first, because unliking requires an existing like, and liking requires the opposite.

##### Per-Item Traffic Pressure

* Viral content events
  * Hotspots can appear in both the DB and cache. The system needs a hot-key detection mechanism so hot data can be cached locally with a reasonable TTL.

### Storage Pressure

* Store data in a KV-oriented form.

### Disaster Recovery Pressure

* DB outage
* Redis cluster instability
* Datacenter outage
* Network failure

## System Architecture

![img](https://i0.hdslb.com/bfs/article/758b2b4bef2f3dd719ef82ccf3bf077f9331d7e4.png)

### Three-Tier Storage Layer

#### DB - TiDB

* TiDB is distributed, so there is no need for manual sharding.
* Like record table
* Like count table

#### Cache

* Use the cache-aside pattern.
* ```javascript
  key-value = user:likes:patten:{mid}:{business_id} - member(messageID)-score(likeTimestamp)
  ```
* Use a `zset` directly, maintain a maximum length, and evict the earliest liked messages.

#### Local Cache

* Handle cache hotspots.
* Use a min-heap algorithm to count the most frequently accessed cache keys within a configurable time window, then keep hot keys and values in local memory with a business-acceptable TTL.

#### Data Migration and Archiving

* Migrate data from TiDB to a KV database (Taishan) to reduce cost.

### Like Service Layer

#### Storage Disaster Recovery (DB, Redis)

* Two datacenters serve as disaster-recovery peers.
  * Datacenter A handles all writes plus part of the reads.
  * Datacenter B handles part of the reads.
* If the DB fails, switch read/write traffic to the standby datacenter through a `db-proxy` sidecar.
* Cross-datacenter cache consistency is maintained by asynchronously consuming TiDB binlogs. When needed, traffic can be switched between datacenters without causing a large amount of cold data to fall back to the database. Cold data here means data missing from Redis and therefore requiring a DB lookup.

#### Service Disaster Recovery

* Multiple storage layers back each other up.
* `redis -> kv -> DB`
* Retry like operations indefinitely at every layer.

#### Async Task Layer

* Write like data, refresh cache, and send like and like-count messages to downstream services such as the recommendation system.
* Disaster recovery for binlog interruption
  * Monitor the binlog stream first.
  * Let the business service emit standby messages ahead of time. When the job detects a binlog anomaly, it automatically switches to the fallback consumer stream.

TODO:

* Cache strategy, plus updates for my own like and favorite operations.

## Reference

* ["Click the Like Button": Bilibili's Architecture Design for a Hundred-Billion-Scale Like System](https://www.bilibili.com/read/cv21576373/?opus_fallback=1)
