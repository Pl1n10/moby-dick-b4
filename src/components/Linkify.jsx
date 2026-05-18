import { Fragment } from 'react'
import Highlight from './Highlight.jsx'

// Renders text where http(s) URLs become clickable anchors. Search-query
// highlighting still applies inside both plain-text segments and anchor
// labels, so a match inside a SharePoint URL is still visually tagged.
//
// Trailing punctuation is stripped from the URL itself so phrases like
// "vedi https://example.com." don't end up with a dot inside the href.
//
// stopPropagation on the anchor onClick prevents the surrounding
// EditableText "click to edit" handler from swallowing the navigation.
const TRAILING_PUNCT_RE = /[.,;:!?)\]'"]+$/

export default function Linkify({ text, query }) {
  if (!text) return text

  const re = /(https?:\/\/[^\s<>"']+)/g
  const segments = []
  let lastIdx = 0
  let m
  while ((m = re.exec(text)) !== null) {
    let url = m[0]
    const trail = url.match(TRAILING_PUNCT_RE)
    if (trail) {
      url = url.slice(0, -trail[0].length)
      re.lastIndex = m.index + url.length
    }
    if (m.index > lastIdx) segments.push({ type: 'text', value: text.slice(lastIdx, m.index) })
    segments.push({ type: 'url', value: url })
    lastIdx = m.index + url.length
  }
  if (lastIdx < text.length) segments.push({ type: 'text', value: text.slice(lastIdx) })

  return segments.map((seg, i) => {
    if (seg.type === 'url') {
      return (
        <a
          key={i}
          href={seg.value}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ color: '#58a6ff', textDecoration: 'underline', wordBreak: 'break-all' }}
        >
          {query ? <Highlight text={seg.value} query={query} /> : seg.value}
        </a>
      )
    }
    return (
      <Fragment key={i}>
        {query ? <Highlight text={seg.value} query={query} /> : seg.value}
      </Fragment>
    )
  })
}
