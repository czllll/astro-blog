---
title: "Explaining cookies, sessions and tokens in authentication"
description: "A quick refresher on how cookies keep state, why servers maintain sessions, and where stateless tokens such as JWT fit in."
published: 2024-10-30
updated: 2024-10-30
tags:
  - web-authentication
lang: en
abbrlink: cookies-session-token
---
In web authentication we frequently encounter the three concepts *cookie*, *session*, and *token*. They form the basis of an application’s identity system, so it is important to understand how they work together.

## Cookie

[RFC 6265](https://datatracker.ietf.org/doc/html/rfc6265) explains HTTP state management clearly:

> This document defines the HTTP Cookie and Set-Cookie header fields. These header fields can be used by HTTP servers to store state (called cookies) at HTTP user agents, letting the servers maintain a stateful session over the mostly stateless HTTP protocol.
> To store state, the origin server includes a Set-Cookie header in an HTTP response. In subsequent requests, the user agent returns a Cookie request header to the origin server. The Cookie header contains cookies the user agent received in previous Set-Cookie headers. The origin server is free to ignore the Cookie header or use its contents for an application-defined purpose.

In other words, to perform session management on top of what used to be a stateless protocol (pre–HTTP/1.0), the server stores **state information** on the client in the form of cookies. The flow looks like this:

![cs-cookie](https://img.dirtsai.work/Pasted%20image%2020241030143916.png)

Cookies are just HTTP headers. They do not have to contain only server-issued data; you could also keep preferences such as language. Because every HTTP request automatically carries cookies, they are perfect for storing a session ID (state) used in session management.

## Why does this enable session management?

HTTP itself is stateless, meaning each request is independent. By storing something like a session ID on the client, the browser automatically sends it on each request, allowing the server to distinguish between users. The server keeps a session store keyed by the session ID and records details such as login status or cart items. When the same user comes back, the browser includes the session ID, the server looks it up, and it can respond with the appropriate state.

## Session

We already touched on sessions when discussing cookies. OWASP defines a session as follows in its [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#introduction):

> A web session is a sequence of network HTTP request and response transactions associated with the same user.

So a session consists of all requests/responses tied to a user. On the server side we must manage the entire lifecycle (creation, storage, validation, destruction). Using cookies to store a session ID for user identification is known as **cookie-based authentication**—the session ID acts as the temporary identifier.

### Drawbacks

Because cookies carry the session ID, there is always a risk of leakage even if we set `HttpOnly`, `Secure`, and `SameSite`. In distributed systems we also have to synchronize session data, e.g., by storing it in Redis.

## JSON Web Token (JWT)

[RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519#section-3) defines JWT as:

> JSON Web Token (JWT) is a compact, URL-safe means of representing claims to be transferred between two parties. The claims in a JWT are encoded as a JSON object that is used as the payload of a JSON Web Signature (JWS) structure or as the plaintext of a JSON Web Encryption (JWE) structure, enabling the claims to be digitally signed or integrity protected with a Message Authentication Code (MAC) and/or encrypted.

This tells us two things: 1) the content is JSON when created; 2) JWT supports two protection modes, JWS and JWE. A JWT on the wire looks like `Header.Payload.Signature`, i.e., three parts separated by dots. Here is how a JWT is generated.

## Creating a JWT

* **Create** the JOSE Header (JSON Object Signing and Encryption Header) to describe metadata, and base64-encode it:

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

* **Create** the payload that contains the claims, then base64-encode it:

```json
{
  "sub": "1234567890",
  "name": "John Doe",
  "admin": true
}
```

* **Generate** the signature
  * Concatenate the encoded header and payload: `base64UrlEncode(header) + "." + base64UrlEncode(payload)`
  * Sign with the chosen algorithm: `HMACSHA256(base64UrlEncode(header) + "." + base64UrlEncode(payload), secret)`
    * For example, NextAuth asks you to set `NEXTAUTH_SECRET` in the environment. This is a symmetric secret: the same key signs and verifies the token. Other algorithms such as RSA use an asymmetric key pair (private key for signing, public key for verification).
  * Base64-encode the result to obtain the signature part.
* **Assemble** the JWT as `Header.Payload.Signature`.

You might have noticed that the steps already include signing—this is the JWS variant of JWT. In practice almost every library (Node’s `jsonwebtoken`, Java’s `jjwt`, etc.) produces JWS tokens because JWS already meets common security requirements. Most applications only need to verify authenticity and integrity, not confidentiality, so JWE is rarely used.

At first glance JWT and sessions both seem to rely on encoded strings. What is the difference?

## Comparing JWT and Session

## Storage location

Sessions are created on the server and stored in memory or a database. Each request triggers a lookup, and any change on the server is immediately reflected in the stored session.

A JWT carries its own data. Each request simply sends the token, and the server verifies the signature without a database lookup.

## Lifecycle

Session lifecycles are managed on the server. When a session expires, the server deletes the corresponding data.

For JWTs, the lifetime is defined when the token is created, typically via the `exp` field in the payload. Once issued, the expiration cannot be changed; you must issue a new token to extend it.

## Security

Sessions themselves do not have signatures and the session ID might leak.

JWTs include a signature so the server can verify integrity before trusting the contents.

## Summary

Cookies, sessions, and JWTs are all fundamental to web authentication. In real projects we choose the appropriate mechanism based on the scenario. Modern frameworks provide mature libraries, but understanding the concepts behind them is still immensely valuable.
