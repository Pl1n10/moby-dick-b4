const S = {
  mono: "'JetBrains Mono', monospace",
  sans: "'IBM Plex Sans', sans-serif",
  statusColors: {
    'New':         { bg: '#e8f4fd', color: '#1a6fa8' },
    'In Progress': { bg: '#fef3e2', color: '#b5740a' },
    'Waiting':     { bg: '#fce8e8', color: '#b52a2a' },
    'Resolved':    { bg: '#e6f5ea', color: '#1a7a36' },
    'Closed':      { bg: '#eaeaea', color: '#666' },
  },
  // Priority badge palette, P0 (most urgent, red) → P5 (lowest, gray).
  priorityColors: {
    0: { bg: '#fce8e8', color: '#b52a2a' },
    1: { bg: '#fdeede', color: '#b5740a' },
    2: { bg: '#fbf3d9', color: '#8a6d0a' },
    3: { bg: '#e8f4fd', color: '#1a6fa8' },
    4: { bg: '#eef0f2', color: '#57606a' },
    5: { bg: '#eaeaea', color: '#666' },
  },
  // P0 row outline (drop-everything signal). Drawn on cell edges, not as a
  // background fill, to keep row text fully legible.
  p0Red: '#f85149',
  // "Info reperibile": amber, deliberately not red — it marks duty relevance,
  // not urgency, and must stay distinguishable from the P0 outline on a row
  // that is both.
  reperibileAmber: '#d29922',
  inputBase: {
    background: '#0d1117',
    border: '1px solid #58a6ff',
    borderRadius: '4px',
    color: '#e6edf3',
    fontSize: '13px',
    fontFamily: "'IBM Plex Sans', sans-serif",
    padding: '4px 8px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
}

export default S
