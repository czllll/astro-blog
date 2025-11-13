import type { CollectionEntry } from 'astro:content'
import { getCollection } from 'astro:content'
import { memoize } from '@/utils/cache'

export type Fragment = CollectionEntry<'memos'>

async function _getmemos() {
  const memos = await getCollection(
    'memos',
    ({ data }) => import.meta.env.DEV || !data.draft,
  )

  return memos.sort(
    (a, b) => b.data.published.valueOf() - a.data.published.valueOf(),
  )
}

export const getmemos = memoize(_getmemos)
