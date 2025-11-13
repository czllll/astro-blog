---
title: "由obsidian的git插件push失败后引申的ssh相关的问题"
description: "本文探讨了在使用 Obsidian 的 Git 插件时遇到的 SSH 连接问题。通过深入分析 SSH 的工作原理、密钥管理和认证过程，文章提供了解决 SSH 连接中频繁要求输入 passphrase 的方案，详细解释了如何配置 SSH Agent 实现自动加载密钥，避免重复输入密码。"
published: 2024-08-12
updated: 2024-08-12
tags:
  - ssh
  - tips
lang: zh
abbrlink: obsidian-ssh-issues
---
## 问题由来

* 在配置了obsidian的git插件后，进行上传时提示 ``permission denied``,联想到之前每次 ``git push``时均需要输入passphrase for key id_rsa，判断应该是obsidian在执行插件脚本时，因为未输入passphrase导致push失败。

## 再进一步

* ssh是什么？生成的私钥和公钥是什么？为什么git push会触发passphrase？passphrase保护的是什么？

## ssh是什么

> Secure Shell (SSH) 协议是一种通过不安全网络向计算机安全发送命令的方法。SSH 使用加密技术对设备之间的连接进行验证和加密。SSH 还可以实现[隧道传输](https://www.cloudflare.com/learning/network-layer/what-is-tunneling/)或端口转发，这是指[数据包](https://www.cloudflare.com/learning/network-layer/what-is-a-packet/)可以穿越原本无法穿越的网络。 SSH 通常用于远程控制服务器、管理基础设施和传输文件。[cloudflare](https://www.cloudflare.com/zh-cn/learning/access-management/what-is-ssh/)

### ssh如何工作

#### 特点

* 基于TCP/IP协议套件上运行
* 采用[公钥加密](https://www.cloudflare.com/learning/ssl/how-does-public-key-encryption-work/)

#### 流程

    1.版本号协商阶段
		1.【服务端】默认打开22端口，等待客户连接
		2.【客户端】向服务端发起TCP连接
		3.CS互相协商版本号
	2.密钥和算法协商阶段
		1.【服务端和客户端】分别发送算法协商报文给对方，协商最终使用算法
		2.【服务端】将服务端公钥发送给客户端，生成会话ID，设成id，发送给客户端
		3.【客户端】生成会话密钥，设为key，计算res = id 异或 key；并将res使用服务端公钥加密发送给服务端
		4.【服务端】使用服务端私钥解密得到res
		5.【服务端】计算res 异或 id得到key，即会话密钥。至此，客户端和服务端均有了服会话密钥和会话ID，之后的data均适用该session密钥进行加解密
	3.认证阶段
		1.ssh客户端在进行身份验证时会按照`publickey,gssapi-keyex,gssapi-with-mic,password`的顺序依次尝试身份验证。其中publickey即为密钥对进行认证，password即为使用传统的密码认证
		2.【publickey】
			a.【客户端】使用ssh-keygen生成公钥id_rsa.pub 和私钥 id_rsa，将公钥发送给服务端，放在.ssh目录下
			b.【客户端】使用session密钥加密 账号，认证方法，公钥，将结果发送给服务端
			c.【服务端】使用session密钥解密 报文，服务端检查.ssh目录下是否有对应的公钥，若无则发送失败消息给客户端；若找到并比对成功，并使用该公钥加密一个随机字符串，简称“质询”，再使用session密钥再加密一次
			d.【客户端】使用session密钥和私钥两次解密后，再使用session密钥加密质询发送给服务端
			e.【服务端】使用session密钥解密报文得到质询，和生成的比对是否相同，相同则通过，不同报错给客户端
		3.【password】
			a.【客户端】使用session密钥加密 账号，认证方法，口令，将结果发送给服务端
			b.【服务端】使用session密钥解密 报文得到账号和口令；服务器对账密进行判断，失败即报错。
	4.会话请求阶段
		确定会话类型，例如启动shell或执行命令或转发端口，是在键入连接ssh命令时隐式完成的。
	5.会话交互阶段

### passphrase是什么？SSH agent是用来干嘛的？

* passphrase是用于保护SSH私钥的密码，在使用 `ssh-keygen`生成密钥对时设置
* SSH agent是一个用于管理和缓存私钥的工具，主要功能是解锁并保存私钥的解锁状态，使得同一用户在同一会话期间无需重复输入 `passphrase`

  * 启动：`ssh-agent -s`
  * 添加私钥到SSH Agent：`ssh-add --apple-use-keychain ~/.ssh/id_rsa`
    * -`-apple-use-keychain`:改参数将私钥的passphrase存储到macos的钥匙串中了
  * 自启动ssh agent 并自动加载密钥：配置在环境变量中如 `.zshrc`中

  ```shell
  ssh-agent -s
  ssh-add --apple-use-keychain ~/.ssh/id_rsa
  ```

  * 配置SSH客户端配置文件(`~/.ssh/config`)：

```shell
Host *
    AddKeysToAgent yes
    UseKeychain yes
    IdentityFile ~/.ssh/id_rsa
```

## 解决方法

* 通过上述的解释，可以对上节开始的几个问题有清晰的回答了。
* 只需要在环境变量中配置好自启动ssh agent就无需每次都手动输入passphrase了；或者也可以在生成密钥对时不设置passphrase，当然后者方法由于安全问题不做推荐。
