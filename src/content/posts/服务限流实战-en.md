---
title: "Service Rate Limiting in Practice"
description: "A practical design note on user-facing rate limiting, downstream circuit breaking, and asynchronous write-back for an LLM-powered comment bot."
published: 2025-11-08
updated: 2025-11-10
tags:
  - develop
  - llm
lang: en
abbrlink: service-rate-limiting-practice
---

*This post was translated by LLM.*

Imagine a scenario like this: I integrated a comment bot into my UGC platform, and users can trigger replies in other users' comment sections through `@robot`. Because the bot relies on third-party APIs such as OpenRouter to generate personalized LLM replies, rate limiting becomes a core concern.

## Bottlenecks

![image.png](https://img.eryi.me/astro-blog/2026/04/aba31bfac98ad57239deef625b80e7f7.png)

**Rate limiting for the AI service**

* The first bottleneck is at the user-request layer. We cannot let users call the comment bot service without limits.
  * 1. At the product level, we can cap how many times a user may call the service within a unit of time, for example by using Redis to record that calls per minute must stay below 5.
  * 2. At the technical level, even if the product layer already enforces limits, the user base may still be so large that the service faces heavy concurrent demand. In that case we can rely on MQ or a token bucket to control throughput.
* The second bottleneck is the traffic limit imposed by the LLM provider.
  * Providers such as OpenRouter enforce RPM and TPM limits per user, which is an external constraint.
  * We can use MQ plus a token bucket for traffic shaping, along with a circuit breaker strategy.
* The third bottleneck appears after the LLM returns a response to us. If write traffic back into the comment service is too high, a single thread may not keep up. We can therefore use a thread pool for parallel writes, and also use MQ to smooth burst traffic.

## Rate Limiting and Circuit Breaking

First, it helps to separate these two concepts clearly.

**Rate limiting** means restricting request frequency or the execution frequency of certain internal functions so that sudden traffic spikes do not make the whole system unavailable. Common rate limiting algorithms include the sliding window, leaky bucket, and token bucket.

**Circuit breaking** means that when calling an external service, database, or microservice, if failures, timeouts, or very slow responses happen continuously, the breaker opens the circuit and temporarily stops calling that dependency. While the breaker is open, the system immediately returns an error or a degraded result instead of sending more requests. After a cooling-off period, it lets a small number of requests through as probes. If the dependency has recovered, the breaker closes automatically.

### Circuit Breaker Properties

* Slow-call circuit breaking
* Exception-ratio circuit breaking
* Half-open probing

For the three bottlenecks mentioned above, we mainly use rate limiting for the user-request layer, circuit breaking for calls to downstream LLM services, and asynchronous MQ-based buffering for writing back to the database because that part is internal I/O.

## In Practice

### Plan

The first part is split into business-level and technical rate limiting.

* Business rate limiting:
  * Limit each user to no more than 5 requests per minute
  * Limit each user to no more than 20 requests per day
    * key design
  * Each request consumes one coin, and requests are rejected if the user does not have enough balance
* Technical rate limiting:
  * Use a token bucket to cap overall QPS at 100

The second part is calling the external LLM service, where the focus is on circuit breaker design.

* Requirements
  * Trip the breaker if latency exceeds 60 seconds
  * Trip the breaker if the exception ratio exceeds 50%
  * After the breaker timeout passes, allow a real user request through as a probe, similar to granting a token, before sending traffic downstream again

The third part is writing back to the DB.

* Introducing Kafka is enough

### Middleware Choice

* We could implement the rate limiting and circuit breaking logic ourselves, but mature middleware already exists for these needs.
* Both Resilience4j and [alibaba/Sentinel](https://github.com/alibaba/sentinel) provide the required capabilities, and in the end I chose Sentinel.
* Reasons
  * Sentinel comes with a native console and supports visual tuning.
  * For traffic shaping in LLM-like scenarios, Sentinel supports Pacing, which can send sudden bursts downstream at a steady rate.
  * Sentinel also supports a token-bucket mode, which matches our traffic-control requirements well.
