---
title: Spring Servlet 回顾
description: Java Servlet 作为处理 Web 请求的标准化方案，逐步取代早期的 CGI，并通过 DispatcherServlet 构成了 Spring MVC 的核心。
published: 2024-12-14
updated: 2024-12-14
tags:
  - java
  - springboot
lang: zh
abbrlink: spring-servlet-recap
---
## Servlet

Servlet 是一个用来处理 HTTP 请求并生成响应的 Java 类。
![](https://img.eryi.me/image-20241213223146486.png)

* Servlet 容器把 HTTP 请求转换成 `HttpServletRequest` 对象，并准备好 `HttpServletResponse` 对象。
* 随后容器把这两个对象交给某个 Web 组件，它可以访问 Bean 或数据库来创建动态内容。
* Web 组件可以直接填充 `HttpServletResponse`，也可以把它传递给其他组件继续处理。
* 最终 Servlet 容器把 `HttpServletResponse` 再次转换成 HTTP 响应，由 Web 服务器返回给客户端。

### 代码

```java
package jakarta.servlet;

import java.io.IOException;

public interface Servlet {
    void init(ServletConfig var1) throws ServletException;

    ServletConfig getServletConfig();

    void service(ServletRequest var1, ServletResponse var2) throws ServletException, IOException;

    String getServletInfo();

    void destroy();
}

// HttpServlet 中的 service 方法
    public void service(ServletRequest req, ServletResponse res) throws ServletException, IOException {
        HttpServletRequest request;
        HttpServletResponse response;
        try {
            request = (HttpServletRequest)req;
            response = (HttpServletResponse)res;
        } catch (ClassCastException var6) {
            throw new ServletException(lStrings.getString("http.non_http"));
        }

        this.service(request, response);
    }
```

### 生命周期

* 当 Servlet 实例还不存在时，Servlet 容器会：
  * 加载 Servlet 类
  * 创建这个类的实例
  * 调用 `init()`（仅在启动时调用一次）
  * 对每个请求调用 `service()`
  * `service()` 会根据 HTTP 方法再去调用 `doGet()` / `doPost()` 等方法
  * 在结束时调用 `destroy()`（同样只执行一次）

### 为什么需要 Servlet

最初 HTTP 服务器只能提供纯 HTML 这样的静态内容。为了能根据用户输入或数据库结果生成页面，服务器需要扩展为支持动态内容。

早期的服务器扩展方式很多：

- CGI：所有服务器都能实现的开放标准
- 像 NSAPI（Netscape）和 ISAPI（Microsoft）这样的私有 API，只能在特定服务器上使用

#### CGI（Common Gateway Interface）

CGI 是一个标准协议，用来定义 Web 服务器如何和外部应用或脚本通信。CGI 程序可以由任何语言编写（C、C++、Perl、Python 等），负责处理请求并生成动态内容。

![image-20241214143933871](https://img.eryi.me/image-20241214143933871.png)

可以看到，Web 服务器需要把每个请求都交给 CGI 程序来返回响应，而且服务器必须为每次请求都创建和销毁一个进程。

> FastCGI：它不会为每个请求都创建新进程，而是使用常驻进程来处理一系列请求，这些进程由 FastCGI 服务器而不是 Web 服务器管理。

之后，Java Servlet 作为 Jakarta EE 的一部分被提出，提供一个标准化、与厂商无关的 API，让 Java 能方便地编写动态 Web 应用。

## DispatcherServlet

DispatcherServlet 是一个特殊的 Servlet，它继承自 HttpServlet，在 Spring MVC 中扮演前端控制器（Front Controller）。它负责拦截进入的 HTTP 请求并分发到合适的控制器方法。*它继承关系是 FrameworkServlet → HttpServletBean → HttpServlet。*

### Spring MVC 的处理流程

#### 请求处理链

```
HTTP request
    -> Filter Chain
    -> DispatcherServlet
            - DispatcherServlet consults HandlerMapping to find the right controller
    -> HandlerMapping
        - HandlerMapping based on url to find specific handler(controller)
    -> HandlerExecutionChain
    -> HandlerAdapter
          - DispatcherServlet calls HandlerAdapter to execute controller method and returns ModelAndView
    -> Controller
            - return ModelAndView
    -> ViewResolver
        - ViewResolver translates view name to actual View
    -> View
        - View renders the response
    -> Response
```

## Spring 过滤器

自定义过滤器需要实现 `Filter` 接口：

```java
public interface Filter {
    default void init(FilterConfig filterConfig) throws ServletException {
    }

    void doFilter(ServletRequest var1, ServletResponse var2, FilterChain var3) throws IOException, ServletException;

    default void destroy() {
    }
}
```

HTTP 请求会先经过若干过滤器，然后才到 DispatcherServlet。多个过滤器可以串联组成 FilterChain，并且可以用 `@Order` 来控制执行顺序。

## Q&A

1. **为什么 Servlet 不是线程安全的？**
   * Servlet 容器只会为每个 Servlet 创建一个实例。
   * 但来自不同客户端的请求会被分发到不同线程，这些线程同时访问这一个实例。
   * 所有线程共享该 Servlet 的实例变量和类变量，因此需要自行保证线程安全。

## 参考资料

[Introduction to Java Servlets - GeeksforGeeks](https://www.geeksforgeeks.org/introduction-java-servlets/)
