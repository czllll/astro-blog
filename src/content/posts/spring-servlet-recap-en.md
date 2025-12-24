---
title: Spring Servlet Recap
description: Java Servlets evolved as an efficient, standardized way to handle web requests in Java, replacing earlier CGI solutions and serving as the foundation for Spring MVC's architecture through the DispatcherServlet.
published: 2024-12-14
updated: 2024-12-14
tags:
  - java
  - springboot
lang: en
abbrlink: spring-servlet-recap
---
## Servlet

A servlet is a Java class that handles HTTP requests and generate responses.
![](https://img.eryi.me/image-20241213223146486.png)

* The servlet container converts HTTP requests into a `HttpServletRequest` object and prepare `HttpServletResponse` object.
* And these objects are delivered to a web component. Which can interact with beans or database to generate dynamic content.
* The web component can fill the `HttpServletResponse` object or pass it to another component to fill it.
* The servlet container ultimately converts the `HttpServletResponse` object into HTTP response and the web server returns it to the client.

### code

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

// service in Httpservlet
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

### lifecycle

* an instance of servlet does not exist, the servlet container:
  * load the servlet class
  * create an instance of servlet class
  * `init()`: Called only once at start
  * `service()`: Called for every request
  * `doGet()/doPost()`: Called by service() based on HTTP method
  * `destroy()`: Called once at end

### Why we need servlet

At first, the HTTP server can only provide static content, like plain HTML files. Server-side extensions were developed to enable dynamic content generation. This means pages could be generated based on user input, database, etc.

Early server-side extensions came in different forms:

- CGI: An open standard that any server could implement
- Proprietary APIs like NSAPI (Netscape) and ISAPI (Microsoft), which were specific to their web servers

#### CGI(Common Gateway Interface)

CGI (Common Gateway Interface) is a standardized protocol that defines how web servers communicate with external applications or scripts. These CGI programs can be written in any programming language (like C, C++, Perl, Python, etc.) and are responsible for processing requests and generating dynamic content.

![image-20241214143933871](https://img.eryi.me/image-20241214143933871.png)

We can see that the web server need to pass every request to the CGI applications to get the response from it. And the server has to create and destroy the process for every request.

> FastCGI: Instead of creating a new process for each request, FastCGI uses persistent processes to handle a series of requests. These processes are owned by the FastCGI server, not the web server.

Later, Java Servlet was developed as part of Jakarta EE to provide a standardized, vendor-neutral API for creating dynamic web applications in Java.

## DispatcherServlet

DispatherServlet is a specialized Sevlet that extends HttpServlet and acts as a Front Controller in Spring MVC applications. It intercepts incoming HTTP requests and dispatches them to appropriate controller methods for processing. *It inherits from FrameworkServlet which inherits from HttpServletBean which inherits from HttpServlet.*

### process of spring MVC

#### request processing flow

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

## Spring filter

Custom filter implementing the Filter interface

```java
public interface Filter {
    default void init(FilterConfig filterConfig) throws ServletException {
    }

    void doFilter(ServletRequest var1, ServletResponse var2, FilterChain var3) throws IOException, ServletException;

    default void destroy() {
    }
}

```

A HTTP request first arrives at filters and then the DispatcherServlet. Multiple filters can be chained together (FilterChain), and we could use @Order to regulate the filter order.

## Q&A

1. Why servlet is not thread-safe?
   * The servlet container creates only one instance of each Servlet.
   * But multiple client requests creates multiple threads that access this single instance simultaneously
   * All threads share the Servlet's instance variables and class variables

## Reference

[Introduction to Java Servlets - GeeksforGeeks](https://www.geeksforgeeks.org/introduction-java-servlets/)
