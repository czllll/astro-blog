import { visit } from 'unist-util-visit'

const WIKI_LINK_PATTERN = /\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/g
const SKIP_PARENT_TYPES = new Set([
  'definition',
  'html',
  'image',
  'imageReference',
  'inlineCode',
  'link',
  'linkReference',
  'yaml',
])

function getLangPrefix(file) {
  const frontmatterLang = file?.data?.astro?.frontmatter?.lang
  if (frontmatterLang === 'en') {
    return '/en'
  }

  return ''
}

function buildWikiHref(target, file) {
  return `${getLangPrefix(file)}/posts/${encodeURIComponent(target.trim())}/`
}

function parseWikiText(value, file) {
  const nodes = []
  let lastIndex = 0
  let match

  WIKI_LINK_PATTERN.lastIndex = 0

  while ((match = WIKI_LINK_PATTERN.exec(value)) !== null) {
    const [raw, target, alias] = match
    const matchStart = match.index

    if (matchStart > lastIndex) {
      nodes.push({
        type: 'text',
        value: value.slice(lastIndex, matchStart),
      })
    }

    nodes.push({
      type: 'link',
      title: null,
      url: buildWikiHref(target, file),
      children: [
        {
          type: 'text',
          value: (alias ?? target).trim(),
        },
      ],
      data: {
        hProperties: {
          'data-wiki-link': target.trim(),
        },
      },
    })

    lastIndex = matchStart + raw.length
  }

  if (lastIndex < value.length) {
    nodes.push({
      type: 'text',
      value: value.slice(lastIndex),
    })
  }

  return nodes
}

export function remarkWikiLinks() {
  return (tree, file) => {
    visit(tree, 'text', (node, index, parent) => {
      if (index === undefined || !parent || SKIP_PARENT_TYPES.has(parent.type)) {
        return
      }

      if (!node.value.includes('[[')) {
        return
      }

      const parsedNodes = parseWikiText(node.value, file)
      if (parsedNodes.length === 1 && parsedNodes[0].type === 'text') {
        return
      }

      parent.children.splice(index, 1, ...parsedNodes)
      return index + parsedNodes.length
    })
  }
}
