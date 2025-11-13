---
title: "Troubleshooting SSH prompts triggered by the Obsidian Git plugin"
description: "Document the root cause of repeated passphrase prompts when Obsidian's Git plugin pushes via SSH, recap how the SSH handshake works, and configure ssh-agent so keys are unlocked automatically."
published: 2024-08-12
updated: 2024-08-12
tags:
  - ssh
  - tips
lang: en
abbrlink: obsidian-ssh-issues
---

## Where the problem came from

* After configuring the Obsidian Git plugin, every upload reported `permission denied`. I remembered that the CLI always asked me to “enter passphrase for key id_rsa” whenever I ran `git push`, so it was clear that the plugin failed because it could not input the passphrase while executing the script.

## Digging deeper

* What exactly is SSH? What are the public key and private key we generated?
* Why does `git push` trigger the passphrase prompt, and what is the passphrase protecting?

## What is SSH

> Secure Shell (SSH) is a protocol for sending commands securely over an untrusted network. It uses cryptography both to authenticate the devices involved and to encrypt the data that flows between them. SSH also supports [tunneling](https://www.cloudflare.com/learning/network-layer/what-is-tunneling/) or port forwarding so that [packets](https://www.cloudflare.com/learning/network-layer/what-is-a-packet/) can traverse networks that would otherwise block them. It is commonly used to control servers remotely, manage infrastructure, and transfer files. — [Cloudflare](https://www.cloudflare.com/zh-cn/learning/access-management/what-is-ssh/)

### How SSH works

#### Characteristics

* Runs on top of the TCP/IP suite.
* Uses [public-key cryptography](https://www.cloudflare.com/learning/ssl/how-does-public-key-encryption-work/).

#### Workflow

1. **Version negotiation**
   1. The server listens on port 22 and waits for clients.
   2. The client initiates a TCP connection.
   3. Both sides exchange protocol versions.
2. **Key and algorithm negotiation**
   1. Client and server send algorithm negotiation packets to each other to agree on the algorithms that will be used.
   2. The server sends its host public key to the client, creates a session ID (call it `id`), and sends it over.
   3. The client generates a session key `key`, computes `res = id XOR key`, and encrypts `res` with the server's public key before sending it back.
   4. The server decrypts the packet with its private key to obtain `res`.
   5. The server computes `res XOR id` to recover the session key. Now both parties share the same session key and ID, and all subsequent data is encrypted with that session key.
3. **Authentication**
   1. The SSH client attempts authentication methods in the order `publickey, gssapi-keyex, gssapi-with-mic, password`. `publickey` uses key pairs; `password` is the traditional credential-based method.
   2. **publickey**
      a. The client runs `ssh-keygen` to create `id_rsa.pub` (public key) and `id_rsa` (private key), then sends the public key to the server and stores it under the server's `.ssh` directory.  
      b. The client encrypts the username, authentication method, and public key with the session key and sends the result to the server.  
      c. The server decrypts the packet using the session key, checks whether the `.ssh` directory contains the corresponding public key, and, if it finds a match, encrypts a random challenge with that public key and then again with the session key.  
      d. The client decrypts twice (session key + private key), re-encrypts the challenge with the session key, and sends it back.  
      e. The server decrypts with the session key, compares the challenge with the one it generated, and accepts or rejects accordingly.
   3. **password**
      a. The client encrypts the username, authentication method, and password with the session key and sends the packet.  
      b. The server decrypts it, validates the credentials, and returns success or failure.
4. **Session request**
   The client specifies the session type (start a shell, run a command, forward a port, etc.). This happens implicitly when we type the `ssh` command.
5. **Session interaction**
   Once the channel is set up, data starts flowing in both directions.

### What is a passphrase? What does ssh-agent do?

* The passphrase is the password that protects an SSH private key. You set it when running `ssh-keygen`.
* `ssh-agent` is a helper program that keeps decrypted private keys in memory so that you do not have to type the passphrase repeatedly within the same login session.

  * Start the agent: `ssh-agent -s`
  * Add the private key to the agent: `ssh-add --apple-use-keychain ~/.ssh/id_rsa`
    * `--apple-use-keychain` stores the passphrase in the macOS keychain.
  * Auto-start the agent and load the key by putting the commands into your shell profile (e.g., `.zshrc`):

  ```shell
  ssh-agent -s
  ssh-add --apple-use-keychain ~/.ssh/id_rsa
  ```

  * Configure the SSH client (`~/.ssh/config`):

```shell
Host *
    AddKeysToAgent yes
    UseKeychain yes
    IdentityFile ~/.ssh/id_rsa
```

## Solution

* With all of the above in mind, the questions from the beginning are now easy to answer.
* As long as we auto-start `ssh-agent` and preload the key via environment configuration, we no longer need to enter the passphrase manually each time. Alternatively, you could generate a key pair without a passphrase, but that is not recommended for security reasons.
