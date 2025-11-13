---
title: "身份验证机制中的cookies,session,token概念解释"
description: "简单的概念复习"
published: 2024-10-30
updated: 2024-10-30
tags:
  - web-authentication
lang: zh
abbrlink: cookies-session-token
---
在web authentication中，经常会出现cookie、session、token这三个概念。这些概念关系到在一个系统中的身份验证机制，在实际开发中是绕不过去的问题。

## Cookie

cookie 在[RFC 6265 ](https://datatracker.ietf.org/doc/html/rfc6265)HTTP状态管理机制中解释的很清楚。

> This document defines the HTTP Cookie and Set-Cookie header fields.These header fields can be used by HTTP servers to store state(called cookies) at HTTP user agents, letting the servers maintain a stateful session over the mostly stateless HTTP protocol.
> To store state, the origin server includes a Set-Cookie header in an HTTP response.  In subsequent requests, the user agent returns a Cookie request header to the origin server.  The Cookie header contains cookies the user agent received in previous Set-Cookie headers.  The origin server is free to ignore the Cookie header or use its contents for an application-defined purpose.

实际上就是说，为了在本几乎（HTTP/1.0之前）无状态的HTTP协议上进行会话管理，HTTP服务器可以在用户端存储**状态信息**，即存放在Cookie里。具体过程如下：
 ![cs-cookie](https://img.dirtsai.work/Pasted%20image%2020241030143916.png)
Cookie是HTTP的一个请求头，不一定只存放server set的cookie，还可以存放一些诸如偏好设置，语言设置的数据。只不过由于cookie的特性（每次HTTP请求都会携带），使得其比较适合存放session id（状态信息） 来进行会话管理。

## 为什么这样就能进行会话管理（session management）了呢？

HTTP本身是无状态的，意味着每个请求都是独立的。Cookie通过在客户端存储一些信息（例如：session id），使得客户端每次请求都会携带服务器set的cookie，使得服务器有能力通过cookie信息识别不同的用户。服务器可以维护会话数据库，存放需要的内容如用户登录状态，购物车信息，并以session id 作为标识。当某一用户再次访问时，客户端将存有的session id 通过cookie发送给服务器，服务器根据session id 查询数据库，回复用户相关的数据状态。从而完成会话管理。

## Session

上面在介绍cookie时其实已经涉及到session了，这里引入[OWASP ](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#introduction)关于session的定义

> A web session is a sequence of network HTTP request and response transactions associated with the same user.

翻译一下就是：Session 是针对同一用户的一系列 HTTP 请求和响应的集合。在实际的开发中，服务端需要管理session的整个生命流程（生成、存储、验证、销毁）。上述使用cookie设置session id 进行用户识别的方式就是**cookie-based authentication**，其核心就是使用了session ID 充当用户的临时身份标识。

### 缺点

由于使用了cookie作为载体来运输session ID，尽管我们会设置 `HttpOnly`、`Secure` 和 `SameSit`等cookie属性来保证其安全，但仍有很多因素可能会导致session ID泄漏，造成不安全的后果。还有一点问题，若我们使用分布式系统可能还要涉及到session同步的问题，如使用redis来集中管理session。

## Json web token（JWT）

引入[RFC 7519)](https://datatracker.ietf.org/doc/html/rfc7519#section-3)的定义

> JSON Web Token (JWT) is a compact, URL-safe means of representing claims to be transferred between two parties.  The claims in a JWT are encoded as a JSON object that is used as the payload of a JSON Web Signature (JWS) structure or as the plaintext of a JSON Web Encryption (JWE) structure, enabling the claims to be digitally signed or integrity protected with a Message Authentication Code (MAC) and/or encrypted.

这个定义主要说明了：1.JWT的内容在创建时是JSON格式的；2.支持JWS和JWE两种保护方式（两种实现方式）。
我们先来看JWT在传输时的结构：`Header.Payload.Signature`。根据 `.`分成了三部分。下面讲一下JWT是如何生成的。

## JWT的生成

* **创建**JOSE Header（JSON Object Signing and Encryption Header），定义一些元数据。并使用Bse64编码将其转为字符串

```json
{
  "alg": "HS256", //签名算法
  "typ": "JWT" //令牌类型，作标识
}

```

* **创建** Payload，定义JWT主体内容。并使用Bse64编码将其转为字符串

```json
{
  "sub": "1234567890",
  "name": "John Doe",
  "admin": true
}
```

* **生成**签名
  * 拼接编码过的header和payload `base64UrlEncode(header) + "." + base64UrlEncode(payload)
  * 使用指定的签名算法进行签名`HMACSHA256(base64UrlEncode(header) + "." + base64UrlEncode(payload), secret)
    * 例如NextAuth就要求我们在环境变量中设置 `NEXTAUTH_SECRET`来作为密钥，这里的密钥为对称密钥，生成和验证签名都使用该密钥；还有另一种非对称加密，如RSA等就是用的非对称密钥对，私钥生成，公钥验证。
  * 再次Base64编码生成字符串，即signature部分
* **拼接**形成JWT
  * `Header.Payload.Signature`
    可能你已经注意到了，上面包含了签名拼接。这实际上是作为JWT实现之一的JWS的实现。在实际开发中，几乎所有语言框架的JWT库均适用JWS的方式生成JWT，例如Node的jsonwebtoken，Java的jjwt等。这是由于JWS已经满足了常见的安全需求，在大多数的应用场景下，JWT仅用来验证数据的真实性和完整性，而不涉及数据的机密性需求，所以几乎不使用JWE的方式来生成JWT。
    JWT和Session有什么区别呢？乍一看好像都是通过编码过的字符串来分辨用户啊？

## JWT和Session的对比

## 存储位置

Session通常由服务端生成并保存在数据库或内存中，每次用户请求都需要在数据库查找会话信息，当服务器端数据发生变化时也能够实时更新会话数据。
而JWT的信息是JWT本身存储的，每次用户请求时，服务器只需要验签即可。

## 生命周期

Session的生命周期是由服务器管理的。Session失效时服务器需要删除对应session数据。
JWT的生命周期是在创建时通过在payload中设置 `exp`参数设置的，在JWT发出后就不能更改其的到期时间了，只能刷新令牌机制来使其无效。

## 安全

Session本身没有签名，SessionId 可能会有泄漏的风险。
JWT有签名机制来保证其完整性和安全性。

## 总结

Cookie、Session、JWT三者都是web authentication中的重要概念，在实际开发中，需要根据实际来选择使用哪一种方式来进行用户身份验证。当然目前每种成熟的框架都有很完整的库来使用，但是了解这些概念肯定大有裨益。
