import { webcrypto } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import fg from 'fast-glob'
import { parse } from 'node-html-parser'

const distDir = path.resolve(process.cwd(), 'dist')
const postsDir = path.resolve(process.cwd(), 'src/content/posts')
const encoder = new TextEncoder()
const pbkdf2Iterations = 210000

type ProtectedPost = {
  filePath: string
  lang: string
  slug: string
  title: string
  passwordEnv: string
  passwordHint: string
}

type EncryptedPayload = {
  algorithm: 'AES-GCM'
  digest: 'SHA-256'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

function extractFrontmatter(source: string) {
  const match = source.match(/^---\n([\s\S]*?)\n---/u)
  return match?.[1] ?? ''
}

function parseYamlScalar(frontmatter: string, key: string) {
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, 'mu')
  const match = frontmatter.match(pattern)
  if (!match) {
    return ''
  }

  const raw = match[1].trim()
  if (
    (raw.startsWith('"') && raw.endsWith('"'))
    || (raw.startsWith('\'') && raw.endsWith('\''))
  ) {
    return raw.slice(1, -1)
  }

  return raw
}

function parseYamlBoolean(frontmatter: string, key: string) {
  return parseYamlScalar(frontmatter, key).toLowerCase() === 'true'
}

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64')
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function collectProtectedPosts() {
  const files = await fg(['**/*.{md,mdx}'], { cwd: postsDir, absolute: true })
  const protectedPosts: ProtectedPost[] = []

  for (const filePath of files) {
    const source = await fs.readFile(filePath, 'utf8')
    const frontmatter = extractFrontmatter(source)
    if (!frontmatter || !parseYamlBoolean(frontmatter, 'protected')) {
      continue
    }

    const parsedPath = path.parse(filePath)
    const slug = parseYamlScalar(frontmatter, 'abbrlink') || parsedPath.name
    const lang = parseYamlScalar(frontmatter, 'lang')
    const title = parseYamlScalar(frontmatter, 'title') || slug
    const passwordEnv = parseYamlScalar(frontmatter, 'passwordEnv')
    const passwordHint = parseYamlScalar(frontmatter, 'passwordHint')

    if (!passwordEnv) {
      throw new Error(`Protected post "${filePath}" is missing "passwordEnv" in frontmatter.`)
    }

    protectedPosts.push({
      filePath,
      lang,
      slug,
      title,
      passwordEnv,
      passwordHint,
    })
  }

  return protectedPosts
}

async function deriveKey(password: string, salt: Uint8Array) {
  const baseKey = await webcrypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return webcrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: pbkdf2Iterations,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptHtml(html: string, password: string): Promise<EncryptedPayload> {
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const ciphertext = await webcrypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encoder.encode(html),
  )

  return {
    algorithm: 'AES-GCM',
    digest: 'SHA-256',
    iterations: pbkdf2Iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  }
}

async function resolveBuiltPostPath(lang: string, slug: string) {
  const candidates = [
    lang ? path.join(distDir, lang, 'posts', slug, 'index.html') : '',
    path.join(distDir, 'posts', slug, 'index.html'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    }
    catch {
      continue
    }
  }

  throw new Error(`Built page not found for protected post "${slug}" (${lang || 'default'}).`)
}

function buildProtectedMarkup(post: ProtectedPost, payload: EncryptedPayload) {
  const payloadJson = JSON.stringify(payload)
  const escapedPayload = escapeHtml(payloadJson)
  const escapedHint = escapeHtml(post.passwordHint)
  const escapedTitle = escapeHtml(post.title)

  return `
<section id="protected-post-root" data-protected-post>
  <style>
    #protected-post-root {
      margin-top: 1rem;
    }
    #protected-post-shell {
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 1rem;
      padding: 1.25rem;
      background: rgba(127, 127, 127, 0.05);
    }
    #protected-post-shell h2 {
      margin: 0 0 0.5rem;
      font-size: 1.1rem;
    }
    #protected-post-shell p {
      margin: 0;
      line-height: 1.7;
    }
    #protected-post-form {
      display: flex;
      gap: 0.75rem;
      margin-top: 1rem;
      flex-wrap: wrap;
    }
    #protected-post-password {
      flex: 1 1 16rem;
      min-width: 0;
      padding: 0.75rem 0.9rem;
      border-radius: 0.75rem;
      border: 1px solid rgba(0, 0, 0, 0.15);
      background: transparent;
      color: inherit;
      font: inherit;
    }
    #protected-post-submit {
      padding: 0.75rem 1rem;
      border: 0;
      border-radius: 0.75rem;
      background: rgb(34, 33, 36);
      color: white;
      font: inherit;
      cursor: pointer;
    }
    #protected-post-submit:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    #protected-post-error {
      margin-top: 0.75rem;
      color: #b42318;
      min-height: 1.25rem;
    }
    #protected-post-hint {
      margin-top: 0.75rem;
      opacity: 0.8;
    }
    #protected-post-body[hidden] {
      display: none;
    }
  </style>
  <div id="protected-post-shell">
    <h2>${escapedTitle}</h2>
    <p>This post is encrypted. Enter the password to decrypt it locally in your browser.</p>
    <form id="protected-post-form">
      <input id="protected-post-password" type="password" autocomplete="current-password" placeholder="Password" />
      <button id="protected-post-submit" type="submit">Decrypt</button>
    </form>
    <p id="protected-post-error" role="status" aria-live="polite"></p>
    ${escapedHint ? `<p id="protected-post-hint">Hint: ${escapedHint}</p>` : ''}
  </div>
  <div id="protected-post-body" hidden></div>
  <script type="application/json" id="protected-post-payload">${escapedPayload}</script>
  <script>
    (() => {
      const payloadNode = document.getElementById('protected-post-payload')
      const form = document.getElementById('protected-post-form')
      const passwordInput = document.getElementById('protected-post-password')
      const submitButton = document.getElementById('protected-post-submit')
      const errorNode = document.getElementById('protected-post-error')
      const shellNode = document.getElementById('protected-post-shell')
      const bodyNode = document.getElementById('protected-post-body')

      if (!(payloadNode && form && passwordInput && submitButton && errorNode && shellNode && bodyNode)) {
        return
      }

      const payload = JSON.parse(payloadNode.textContent || '{}')
      const textEncoder = new TextEncoder()
      const textDecoder = new TextDecoder()

      function fromBase64(value) {
        return Uint8Array.from(atob(value), char => char.charCodeAt(0))
      }

      async function deriveKey(password, salt) {
        const baseKey = await crypto.subtle.importKey(
          'raw',
          textEncoder.encode(password),
          'PBKDF2',
          false,
          ['deriveKey'],
        )

        return crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt,
            iterations: payload.iterations,
            hash: payload.digest,
          },
          baseKey,
          {
            name: payload.algorithm,
            length: 256,
          },
          false,
          ['decrypt'],
        )
      }

      function activateScripts(container) {
        const scripts = container.querySelectorAll('script')
        scripts.forEach((script) => {
          const replacement = document.createElement('script')
          Array.from(script.attributes).forEach((attribute) => {
            replacement.setAttribute(attribute.name, attribute.value)
          })
          replacement.textContent = script.textContent
          script.replaceWith(replacement)
        })
      }

      async function decrypt(password) {
        const key = await deriveKey(password, fromBase64(payload.salt))
        const decrypted = await crypto.subtle.decrypt(
          {
            name: payload.algorithm,
            iv: fromBase64(payload.iv),
          },
          key,
          fromBase64(payload.ciphertext),
        )

        return textDecoder.decode(decrypted)
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault()
        errorNode.textContent = ''
        submitButton.disabled = true

        try {
          const password = passwordInput.value
          const html = await decrypt(password)
          bodyNode.innerHTML = html
          activateScripts(bodyNode)
          bodyNode.hidden = false
          shellNode.hidden = true
          document.dispatchEvent(new Event('astro:page-load'))
        }
        catch {
          errorNode.textContent = 'Wrong password or corrupted encrypted payload.'
        }
        finally {
          submitButton.disabled = false
        }
      })
    })()
  </script>
</section>
  `.trim()
}

async function protectBuiltPage(post: ProtectedPost) {
  const password = process.env[post.passwordEnv]
  if (!password) {
    throw new Error(`Missing required environment variable "${post.passwordEnv}" for protected post "${post.slug}".`)
  }

  const builtPath = await resolveBuiltPostPath(post.lang, post.slug)
  const html = await fs.readFile(builtPath, 'utf8')
  const document = parse(html)
  const postContent = document.querySelector('#post-content')
  if (!postContent) {
    throw new Error(`Missing "#post-content" in built page "${builtPath}".`)
  }

  const encryptedPayload = await encryptHtml(postContent.innerHTML, password)
  postContent.set_content(buildProtectedMarkup(post, encryptedPayload))
  await fs.writeFile(builtPath, document.toString(), 'utf8')

  const relativePath = path.relative(distDir, path.dirname(builtPath)).replaceAll(path.sep, '/')
  const routePath = `/${relativePath}/`

  return {
    routePath,
  }
}

async function pruneProtectedRoutesFromSitemap(routePaths: string[]) {
  const sitemapPath = path.join(distDir, 'sitemap-0.xml')
  try {
    let sitemap = await fs.readFile(sitemapPath, 'utf8')

    for (const routePath of routePaths) {
      const pattern = new RegExp(
        `<url><loc>[^<]*${escapeRegExp(routePath)}</loc></url>`,
        'g',
      )
      sitemap = sitemap.replace(pattern, '')
    }

    await fs.writeFile(sitemapPath, sitemap, 'utf8')
  }
  catch {
    // Ignore missing sitemap output in non-static environments.
  }
}

async function main() {
  const protectedPosts = await collectProtectedPosts()
  if (protectedPosts.length === 0) {
    console.log('🔐 No protected posts configured')
    return
  }

  const protectedRoutes: string[] = []
  for (const post of protectedPosts) {
    const { routePath } = await protectBuiltPage(post)
    protectedRoutes.push(routePath)
    console.log(`🔐 Protected ${routePath}`)
  }

  await pruneProtectedRoutesFromSitemap(protectedRoutes)
  console.log(`🔐 Finished protecting ${protectedPosts.length} post variants`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`❌ Failed to protect posts: ${message}`)
  process.exit(1)
})
