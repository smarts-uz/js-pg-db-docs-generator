// ─── HTML Renderer ────────────────────────────────────────────────────────────

const FK_ACTION = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
const TYPE_KIND = { e: 'ENUM', d: 'DOMAIN', c: 'COMPOSITE' };

export function renderHTML(schema, opts) {
  const title   = opts.title || `${opts.database || opts.url} — DB Docs`;
  const grouped = groupBySchema(schema.tables);
  const schemaNames = [...new Set(schema.tables.map(t => t.schema))];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
${CSS}
</style>
</head>
<body>
<div class="layout">
  <!-- Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="logo">🐘 pgdocgen</div>
      <div class="db-name">${esc(opts.database || 'database')}</div>
    </div>
    <div class="search-wrap">
      <input type="text" id="search" placeholder="Search tables, columns…" oninput="doSearch(this.value)">
    </div>
    <nav id="nav">
      ${schemaNames.map(s => `
      <div class="nav-schema">
        <div class="nav-schema-label">${esc(s)}</div>
        ${(grouped[s] || []).map(t => `
        <a class="nav-item" href="#${slug(s, t.name)}">${esc(t.name)}</a>`).join('')}
      </div>`).join('')}
      ${schema.views.length ? `<div class="nav-schema"><div class="nav-schema-label">Views</div>
        ${schema.views.map(v => `<a class="nav-item" href="#view-${slug(v.schema, v.name)}">${esc(v.name)}</a>`).join('')}
      </div>` : ''}
      ${schema.functions.length ? `<div class="nav-schema"><div class="nav-schema-label">Functions</div>
        ${schema.functions.map(f => `<a class="nav-item" href="#fn-${slug(f.schema, f.name)}">${esc(f.name)}()</a>`).join('')}
      </div>` : ''}
    </nav>
  </aside>

  <!-- Main -->
  <main>
    <!-- Header -->
    <header class="page-header">
      <h1>${esc(title)}</h1>
      <div class="meta-row">
        <span class="badge">${esc(schema.serverVersion?.split(' ').slice(0,2).join(' ') || 'PostgreSQL')}</span>
        <span class="badge">${schema.tables.length} tables</span>
        <span class="badge">${schema.views.length} views</span>
        <span class="badge">${schema.functions.length} functions</span>
        ${schema.extensions.length ? `<span class="badge">${schema.extensions.length} extensions</span>` : ''}
        <span class="badge muted">Generated ${new Date().toLocaleString()}</span>
      </div>
    </header>

    <!-- Summary cards -->
    <section class="summary-grid">
      <div class="card">
        <div class="card-num">${schema.tables.length}</div>
        <div class="card-label">Tables</div>
      </div>
      <div class="card">
        <div class="card-num">${schema.tables.reduce((n,t)=>n+t.columns.length,0)}</div>
        <div class="card-label">Columns</div>
      </div>
      <div class="card">
        <div class="card-num">${schema.views.length}</div>
        <div class="card-label">Views</div>
      </div>
      <div class="card">
        <div class="card-num">${schema.functions.length}</div>
        <div class="card-label">Functions</div>
      </div>
      <div class="card">
        <div class="card-num">${schema.types.length}</div>
        <div class="card-label">Custom Types</div>
      </div>
      <div class="card">
        <div class="card-num">${schema.sequences.length}</div>
        <div class="card-label">Sequences</div>
      </div>
    </section>

    <!-- Extensions -->
    ${schema.extensions.length ? `
    <section class="section">
      <h2 class="section-title">Extensions</h2>
      <div class="ext-row">
        ${schema.extensions.map(e => `<span class="ext-badge">${esc(e.name)} <em>${esc(e.version)}</em></span>`).join('')}
      </div>
    </section>` : ''}

    <!-- Tables -->
    ${schemaNames.map(s => `
    <section class="section">
      <h2 class="section-title schema-title">Schema: <span>${esc(s)}</span></h2>
      ${(grouped[s] || []).map(t => renderTable(t)).join('\n')}
    </section>`).join('')}

    <!-- Views -->
    ${schema.views.length ? `
    <section class="section">
      <h2 class="section-title">Views</h2>
      ${schema.views.map(v => renderView(v)).join('\n')}
    </section>` : ''}

    <!-- Functions -->
    ${schema.functions.length ? `
    <section class="section">
      <h2 class="section-title">Functions & Procedures</h2>
      ${schema.functions.map(f => renderFunction(f)).join('\n')}
    </section>` : ''}

    <!-- Types -->
    ${schema.types.length ? `
    <section class="section">
      <h2 class="section-title">Custom Types</h2>
      <div class="types-grid">
        ${schema.types.map(t => renderType(t)).join('\n')}
      </div>
    </section>` : ''}

    <!-- Sequences -->
    ${schema.sequences.length ? `
    <section class="section">
      <h2 class="section-title">Sequences</h2>
      ${renderSequencesTable(schema.sequences)}
    </section>` : ''}

  </main>
</div>

<script>
${JS}
</script>
</body>
</html>`;
}

// ── Render helpers ────────────────────────────────────────────────────────────

function renderTable(t) {
  const hasFK = t.fks.length > 0;
  const hasTriggers = t.triggers.length > 0;

  return `
<div class="table-block" id="${slug(t.schema, t.name)}">
  <div class="table-header">
    <div class="table-name-row">
      <h3 class="table-name">${esc(t.name)}</h3>
      ${t.comment ? `<span class="table-comment">${esc(t.comment)}</span>` : ''}
    </div>
    <div class="table-meta">
      <span class="meta-chip">~${fmt(t.row_estimate)} rows</span>
      <span class="meta-chip">${esc(t.total_size)}</span>
      <span class="meta-chip">${t.columns.length} cols</span>
      ${t.indexes.length ? `<span class="meta-chip">${t.indexes.length} indexes</span>` : ''}
    </div>
  </div>

  <div class="table-scroll">
  <table class="cols-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Column</th>
        <th>Type</th>
        <th>Nullable</th>
        <th>Default</th>
        <th>Comment</th>
      </tr>
    </thead>
    <tbody>
      ${t.columns.map(c => `
      <tr class="${c.is_pk ? 'row-pk' : ''}${c.is_unique && !c.is_pk ? ' row-unique' : ''}">
        <td class="col-num">${c.num}</td>
        <td class="col-name">
          ${c.is_pk ? '<span class="badge-pk" title="Primary Key">PK</span>' : ''}
          ${c.is_unique && !c.is_pk ? '<span class="badge-uk" title="Unique">UK</span>' : ''}
          <span class="col-name-text">${esc(c.name)}</span>
        </td>
        <td class="col-type">${esc(c.type)}</td>
        <td class="col-null">${c.nullable ? '<span class="null-yes">YES</span>' : '<span class="null-no">NO</span>'}</td>
        <td class="col-default">${c.default_val ? `<code>${esc(c.default_val)}</code>` : ''}</td>
        <td class="col-comment">${c.comment ? esc(c.comment) : ''}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  </div>

  ${t.indexes.length ? `
  <div class="sub-section">
    <div class="sub-title">Indexes</div>
    <table class="simple-table">
      <thead><tr><th>Name</th><th>Type</th><th>Unique</th><th>Definition</th></tr></thead>
      <tbody>
        ${t.indexes.map(i => `
        <tr>
          <td><code>${esc(i.name)}</code></td>
          <td><span class="idx-type">${esc(i.type.toUpperCase())}</span></td>
          <td>${i.is_unique ? '✓' : ''}</td>
          <td class="idx-def"><code>${esc(i.definition)}</code></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${hasFK ? `
  <div class="sub-section">
    <div class="sub-title">Foreign Keys</div>
    <table class="simple-table">
      <thead><tr><th>Name</th><th>Column</th><th>References</th><th>On Update</th><th>On Delete</th></tr></thead>
      <tbody>
        ${t.fks.map(fk => `
        <tr>
          <td><code>${esc(fk.name)}</code></td>
          <td><code>${esc(fk.column)}</code></td>
          <td><a href="#${slug(fk.ref_schema, fk.ref_table)}" class="fk-link">${esc(fk.ref_schema)}.${esc(fk.ref_table)}.${esc(fk.ref_column)}</a></td>
          <td>${FK_ACTION[fk.on_update] || fk.on_update}</td>
          <td>${FK_ACTION[fk.on_delete] || fk.on_delete}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${hasTriggers ? `
  <div class="sub-section">
    <div class="sub-title">Triggers</div>
    <table class="simple-table">
      <thead><tr><th>Name</th><th>Timing</th><th>Event</th><th>Function</th><th>Enabled</th></tr></thead>
      <tbody>
        ${t.triggers.map(tg => `
        <tr>
          <td><code>${esc(tg.name)}</code></td>
          <td>${esc(tg.timing)}</td>
          <td>${esc(tg.event)}</td>
          <td><code>${esc(tg.function_name)}</code></td>
          <td>${tg.enabled ? '✓' : '✗'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}
</div>`;
}

function renderView(v) {
  return `
<div class="table-block" id="view-${slug(v.schema, v.name)}">
  <div class="table-header">
    <div class="table-name-row">
      <h3 class="table-name"><span class="badge-view">VIEW</span> ${esc(v.name)}</h3>
      <span class="table-comment">${esc(v.schema)}</span>
    </div>
  </div>
  ${v.definition ? `<div class="code-block"><pre>${esc(v.definition.trim())}</pre></div>` : ''}
</div>`;
}

function renderFunction(f) {
  const formattedComment = f.comment
    ? `<pre class="fn-comment">${esc(f.comment)}</pre>`
    : '';

  return `
<div class="table-block fn-block" id="fn-${slug(f.schema, f.name)}">
  <div class="table-header">
    <div class="table-name-row">
      <h3 class="table-name"><span class="badge-fn">FN</span> ${esc(f.name)}</h3>
    </div>
    <div class="table-meta">
      <span class="meta-chip">${esc(f.language?.toUpperCase() || '')}</span>
      ${f.security_definer ? '<span class="meta-chip warn">SECURITY DEFINER</span>' : ''}
    </div>
  </div>
  <div class="fn-sig">
    <code>${esc(f.name)}(${esc(f.arguments || '')})</code>
    <span class="fn-returns">→ ${esc(f.return_type || 'void')}</span>
  </div>
  ${formattedComment}
  ${f.body ? `<div class="code-block"><pre>${esc(f.body.trim())}</pre></div>` : ''}
</div>`;
}

function renderType(t) {
  return `
<div class="type-card">
  <div class="type-header">
    <span class="type-kind">${TYPE_KIND[t.kind] || t.kind}</span>
    <span class="type-name">${esc(t.name)}</span>
  </div>
  ${t.comment ? `<div class="type-comment">${esc(t.comment)}</div>` : ''}
  ${Array.isArray(t.enum_values) && t.enum_values.length ? `
  <div class="enum-values">
    ${t.enum_values.map(v => `<span class="enum-val">'${esc(v)}'</span>`).join('')}
  </div>` : ''}
</div>`;
}

function renderSequencesTable(sequences) {
  return `
  <div class="table-scroll">
  <table class="cols-table">
    <thead>
      <tr><th>Schema</th><th>Name</th><th>Type</th><th>Start</th><th>Min</th><th>Max</th><th>Increment</th></tr>
    </thead>
    <tbody>
      ${sequences.map(s => `
      <tr>
        <td>${esc(s.schema)}</td>
        <td><code>${esc(s.name)}</code></td>
        <td>${esc(s.data_type)}</td>
        <td>${esc(s.start_value)}</td>
        <td>${esc(s.minimum_value)}</td>
        <td>${esc(s.maximum_value)}</td>
        <td>${esc(s.increment)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  </div>`;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function slug(schema, name) {
  return `${schema}-${name}`.replace(/[^a-z0-9_-]/gi, '_');
}

function fmt(n) {
  if (n == null || n < 0) return '?';
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1)+'M';
  if (n >= 1_000)     return (n/1_000).toFixed(1)+'K';
  return String(n);
}

function groupBySchema(tables) {
  const m = {};
  for (const t of tables) (m[t.schema] = m[t.schema] || []).push(t);
  return m;
}

// ── Embedded CSS ──────────────────────────────────────────────────────────────

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #ffffff;
    --surface: #f8f9fa;
    --surface2: #f1f3f4;
    --border: #e2e6ea;
    --text: #1a1d21;
    --muted: #6c757d;
    --accent: #2563eb;
    --accent-bg: #eff6ff;
    --green: #16a34a;
    --red: #dc2626;
    --orange: #d97706;
    --sidebar-w: 260px;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1117; --surface: #161b22; --surface2: #1c2128;
      --border: #2d333b; --text: #e6edf3; --muted: #8b949e;
      --accent: #58a6ff; --accent-bg: #1a2840;
    }
  }

  html { font-size: 14px; }
  body { font-family: var(--font); background: var(--bg); color: var(--text); line-height: 1.6; }

  /* Layout */
  .layout { display: flex; min-height: 100vh; }

  /* Sidebar */
  .sidebar {
    width: var(--sidebar-w); min-width: var(--sidebar-w);
    background: var(--surface); border-right: 1px solid var(--border);
    position: sticky; top: 0; height: 100vh; overflow-y: auto;
    display: flex; flex-direction: column;
  }
  .sidebar::-webkit-scrollbar { width: 4px; }
  .sidebar::-webkit-scrollbar-thumb { background: var(--border); }

  .sidebar-header { padding: 20px 16px 14px; border-bottom: 1px solid var(--border); }
  .logo { font-size: 15px; font-weight: 700; color: var(--accent); }
  .db-name { font-size: 12px; color: var(--muted); margin-top: 2px; font-family: var(--mono); }

  .search-wrap { padding: 10px 12px; border-bottom: 1px solid var(--border); }
  #search {
    width: 100%; padding: 6px 10px; border: 1px solid var(--border);
    border-radius: 6px; background: var(--bg); color: var(--text);
    font-size: 12px; outline: none;
  }
  #search:focus { border-color: var(--accent); }

  nav { padding: 8px 0 20px; flex: 1; }
  .nav-schema { margin-bottom: 4px; }
  .nav-schema-label {
    font-size: 10px; font-weight: 600; letter-spacing: .08em;
    text-transform: uppercase; color: var(--muted);
    padding: 8px 16px 4px;
  }
  .nav-item {
    display: block; padding: 5px 16px; font-size: 13px;
    color: var(--muted); text-decoration: none; border-left: 2px solid transparent;
    transition: all .15s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .nav-item:hover { color: var(--text); background: var(--surface2); }
  .nav-item.active { color: var(--accent); border-left-color: var(--accent); background: var(--accent-bg); }
  .nav-item.hidden { display: none; }

  /* Main */
  main { flex: 1; padding: 32px 40px; max-width: 1200px; overflow-x: hidden; }

  .page-header { margin-bottom: 28px; }
  .page-header h1 { font-size: 24px; font-weight: 700; margin-bottom: 10px; }
  .meta-row { display: flex; flex-wrap: wrap; gap: 6px; }

  /* Summary cards */
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; margin-bottom: 36px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; text-align: center; }
  .card-num { font-size: 28px; font-weight: 700; color: var(--accent); font-family: var(--mono); }
  .card-label { font-size: 11px; color: var(--muted); margin-top: 2px; text-transform: uppercase; letter-spacing: .06em; }

  /* Badges */
  .badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; padding: 3px 8px; border-radius: 4px;
    background: var(--surface2); border: 1px solid var(--border); color: var(--muted);
  }
  .badge.muted { opacity: .7; }
  .badge-pk { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; margin-right: 4px; }
  .badge-uk { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px; background: #ede9fe; color: #5b21b6; border: 1px solid #ddd6fe; margin-right: 4px; }
  .badge-view { display: inline-block; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; background: var(--accent-bg); color: var(--accent); margin-right: 6px; }
  .badge-fn { display: inline-block; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; background: #f0fdf4; color: #15803d; margin-right: 6px; }

  /* Sections */
  .section { margin-bottom: 48px; }
  .section-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }
  .section-title.schema-title span { color: var(--accent); }

  /* Table blocks */
  .table-block { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 20px; overflow: hidden; }
  .table-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 14px 18px 12px; border-bottom: 1px solid var(--border); gap: 12px; flex-wrap: wrap; }
  .table-name-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .table-name { font-size: 15px; font-weight: 600; font-family: var(--mono); }
  .table-comment { font-size: 12px; color: var(--muted); font-style: italic; }
  .table-meta { display: flex; gap: 6px; flex-wrap: wrap; }
  .meta-chip { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: var(--surface2); border: 1px solid var(--border); color: var(--muted); }
  .meta-chip.warn { background: #fef3c7; color: #92400e; border-color: #fde68a; }

  /* Columns table */
  .table-scroll { overflow-x: auto; }
  .cols-table { width: 100%; border-collapse: collapse; }
  .cols-table th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: 8px 12px; text-align: left; background: var(--surface2); border-bottom: 1px solid var(--border); font-weight: 600; }
  .cols-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: middle; }
  .cols-table tr:last-child td { border-bottom: none; }
  .cols-table tr:hover td { background: var(--surface2); }
  .row-pk { background: rgba(234,179,8,.04); }
  .col-num { color: var(--muted); font-family: var(--mono); font-size: 11px; }
  .col-name { white-space: nowrap; }
  .col-name-text { font-family: var(--mono); font-weight: 500; }
  .col-type { font-family: var(--mono); color: var(--accent); white-space: nowrap; }
  .col-default code { font-family: var(--mono); font-size: 12px; background: var(--surface2); padding: 1px 5px; border-radius: 3px; }
  .col-comment { color: var(--muted); font-style: italic; font-size: 12px; }
  .null-yes { color: var(--muted); }
  .null-no { color: var(--red); font-weight: 600; font-size: 11px; }

  /* Sub-sections (indexes, FKs, triggers) */
  .sub-section { padding: 0 18px 14px; border-top: 1px solid var(--border); margin-top: 0; }
  .sub-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); padding: 10px 0 8px; }
  .simple-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .simple-table th { color: var(--muted); text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--border); font-size: 11px; font-weight: 600; }
  .simple-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); }
  .simple-table tr:last-child td { border-bottom: none; }
  .simple-table code { font-family: var(--mono); background: var(--surface2); padding: 1px 5px; border-radius: 3px; font-size: 11px; }
  .idx-type { font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 3px; background: var(--surface2); border: 1px solid var(--border); color: var(--muted); }
  .idx-def code { font-size: 11px; word-break: break-all; }
  .fk-link { color: var(--accent); text-decoration: none; font-family: var(--mono); }
  .fk-link:hover { text-decoration: underline; }

  /* Functions */
  .fn-sig { padding: 10px 18px; background: var(--surface2); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .fn-sig code { font-family: var(--mono); font-size: 13px; }
  .fn-returns { font-family: var(--mono); font-size: 12px; color: var(--green); }

  /* Code blocks */
  .code-block { padding: 14px 18px; background: var(--bg); border-top: 1px solid var(--border); }
  .code-block pre { font-family: var(--mono); font-size: 12px; line-height: 1.6; color: var(--muted); white-space: pre-wrap; word-break: break-word; }

  /* Types */
  .types-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
  .type-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
  .type-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .type-kind { font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 3px; background: var(--accent-bg); color: var(--accent); border: 1px solid; letter-spacing: .06em; }
  .type-name { font-family: var(--mono); font-weight: 600; font-size: 13px; }
  .type-comment { font-size: 12px; color: var(--muted); font-style: italic; margin-bottom: 6px; }
  .enum-values { display: flex; flex-wrap: wrap; gap: 4px; }
  .enum-val { font-family: var(--mono); font-size: 11px; background: var(--surface2); border: 1px solid var(--border); padding: 2px 6px; border-radius: 3px; color: var(--green); }

  /* Extensions */
  .ext-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .ext-badge { font-size: 12px; padding: 4px 10px; border-radius: 6px; background: var(--surface2); border: 1px solid var(--border); font-family: var(--mono); }
  .ext-badge em { color: var(--muted); font-style: normal; }

  @media (max-width: 768px) {
    .layout { flex-direction: column; }
    .sidebar { width: 100%; height: auto; position: static; }
    main { padding: 20px; }
  }
`;

// ── Embedded JS ───────────────────────────────────────────────────────────────

const JS = `
  // Active nav highlight on scroll
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
        const a = document.querySelector('.nav-item[href="#' + e.target.id + '"]');
        if (a) a.classList.add('active');
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });

  document.querySelectorAll('.table-block').forEach(el => observer.observe(el));

  // Search
  function doSearch(q) {
    const items = document.querySelectorAll('.nav-item');
    q = q.toLowerCase().trim();
    items.forEach(a => {
      if (!q || a.textContent.toLowerCase().includes(q)) {
        a.classList.remove('hidden');
      } else {
        a.classList.add('hidden');
      }
    });
  }
`;
