// src/HtmlRenderer.js

const FK_ACTION = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
const TYPE_KIND  = { e: 'ENUM', d: 'DOMAIN', c: 'COMPOSITE' };

/**
 * Converts an extracted schema model into a single self-contained HTML file.
 * All methods are static — this class is never instantiated.
 */
export class HtmlRenderer {

  /**
   * @param {object} schema   Extracted schema data
   * @param {object} opts     CLI options (title, database, etc.)
   * @returns {string}        Complete HTML document
   */
  static render(schema, opts) {
    const title = opts.title || `${schema.database} — DB Docs`;
    const grouped = HtmlRenderer.#groupBySchema(schema.tables);
    const schemaNames = [...new Set(schema.tables.map(t => t.schema))];

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${HtmlRenderer.#esc(title)}</title>
<style>${HtmlRenderer.#css()}</style>
</head>
<body>
<div class="layout">
  ${HtmlRenderer.#sidebar(schema, schemaNames, grouped, opts)}
  <main>
    ${HtmlRenderer.#pageHeader(schema, title)}
    ${HtmlRenderer.#summaryCards(schema)}
    ${schema.extensions.length ? HtmlRenderer.#extensionsSection(schema.extensions) : ''}
    ${schemaNames.map(s => HtmlRenderer.#schemaSection(s, grouped[s] || [])).join('\n')}
    ${schema.views.length     ? HtmlRenderer.#viewsSection(schema.views)           : ''}
    ${schema.functions.length ? HtmlRenderer.#functionsSection(schema.functions)   : ''}
    ${schema.types.length     ? HtmlRenderer.#typesSection(schema.types)           : ''}
    ${schema.sequences.length ? HtmlRenderer.#sequencesSection(schema.sequences)   : ''}
  </main>
</div>
<script>${HtmlRenderer.#js()}</script>
</body>
</html>`;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Layout sections
  // ════════════════════════════════════════════════════════════════════════

  static #sidebar(schema, schemaNames, grouped, opts) {
    const e = HtmlRenderer.#esc;
    const s = HtmlRenderer.#slug;
    return `
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="logo">🐘 pgdocgen</div>
      <div class="db-name">${e(schema.database)}</div>
      <div class="db-dialect">${e(opts.dialect || 'postgresql')}</div>
    </div>
    <div class="search-wrap">
      <input type="text" id="search" placeholder="Search…" oninput="doSearch(this.value)">
    </div>
    <nav id="nav">
      ${schemaNames.map(sc => `
      <div class="nav-schema">
        <div class="nav-schema-label">${e(sc)}</div>
        ${(grouped[sc] || []).map(t =>
          `<a class="nav-item" href="#${s(sc, t.name)}">${e(t.name)}</a>`
        ).join('')}
      </div>`).join('')}
      ${schema.views.length ? `
      <div class="nav-schema">
        <div class="nav-schema-label">Views</div>
        ${schema.views.map(v =>
          `<a class="nav-item" href="#view-${s(v.schema, v.name)}">${e(v.name)}</a>`
        ).join('')}
      </div>` : ''}
      ${schema.functions.length ? `
      <div class="nav-schema">
        <div class="nav-schema-label">Functions</div>
        ${schema.functions.map(f =>
          `<a class="nav-item" href="#fn-${s(f.schema, f.name)}">${e(f.name)}()</a>`
        ).join('')}
      </div>` : ''}
    </nav>
  </aside>`;
  }

  static #pageHeader(schema, title) {
    const e = HtmlRenderer.#esc;
    return `
    <header class="page-header">
      <h1>${e(title)}</h1>
      <div class="meta-row">
        <span class="badge">${e(schema.serverVersion?.split(' ').slice(0,2).join(' '))}</span>
        <span class="badge">${schema.tables.length} tables</span>
        <span class="badge">${schema.views.length} views</span>
        <span class="badge">${schema.functions.length} functions</span>
        <span class="badge muted">Generated ${new Date().toLocaleString()}</span>
      </div>
    </header>`;
  }

  static #summaryCards(schema) {
    const totalCols = schema.tables.reduce((n, t) => n + (t.columns?.length || 0), 0);
    return `
    <section class="summary-grid">
      ${[
        ['Tables',    schema.tables.length],
        ['Columns',   totalCols],
        ['Views',     schema.views.length],
        ['Functions', schema.functions.length],
        ['Types',     schema.types.length],
        ['Sequences', schema.sequences.length],
      ].map(([label, num]) => `
      <div class="card">
        <div class="card-num">${num}</div>
        <div class="card-label">${label}</div>
      </div>`).join('')}
    </section>`;
  }

  static #extensionsSection(extensions) {
    const e = HtmlRenderer.#esc;
    return `
    <section class="section">
      <h2 class="section-title">Extensions</h2>
      <div class="ext-row">
        ${extensions.map(ex =>
          `<span class="ext-badge">${e(ex.name)} <em>${e(ex.version)}</em></span>`
        ).join('')}
      </div>
    </section>`;
  }

  static #schemaSection(schemaName, tables) {
    const e = HtmlRenderer.#esc;
    return `
    <section class="section">
      <h2 class="section-title schema-title">Schema: <span>${e(schemaName)}</span></h2>
      ${tables.map(t => HtmlRenderer.#tableBlock(t)).join('\n')}
    </section>`;
  }

  static #viewsSection(views) {
    return `
    <section class="section">
      <h2 class="section-title">Views</h2>
      ${views.map(v => HtmlRenderer.#viewBlock(v)).join('\n')}
    </section>`;
  }

  static #functionsSection(functions) {
    return `
    <section class="section">
      <h2 class="section-title">Functions &amp; Procedures</h2>
      ${functions.map(f => HtmlRenderer.#functionBlock(f)).join('\n')}
    </section>`;
  }

  static #typesSection(types) {
    return `
    <section class="section">
      <h2 class="section-title">Custom Types</h2>
      <div class="types-grid">
        ${types.map(t => HtmlRenderer.#typeCard(t)).join('\n')}
      </div>
    </section>`;
  }

  static #sequencesSection(sequences) {
    const e = HtmlRenderer.#esc;
    return `
    <section class="section">
      <h2 class="section-title">Sequences</h2>
      <div class="table-scroll">
      <table class="cols-table">
        <thead>
          <tr><th>Schema</th><th>Name</th><th>Type</th><th>Start</th><th>Min</th><th>Max</th><th>Increment</th></tr>
        </thead>
        <tbody>
          ${sequences.map(s => `
          <tr>
            <td>${e(s.schema)}</td>
            <td><code>${e(s.name)}</code></td>
            <td>${e(s.data_type)}</td>
            <td>${e(s.start_value)}</td>
            <td>${e(s.minimum_value)}</td>
            <td>${e(s.maximum_value)}</td>
            <td>${e(s.increment)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </section>`;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Block renderers
  // ════════════════════════════════════════════════════════════════════════

  static #tableBlock(t) {
    const e = HtmlRenderer.#esc;
    const s = HtmlRenderer.#slug;
    return `
<div class="table-block" id="${s(t.schema, t.name)}">
  <div class="table-header">
    <div class="table-name-row">
      <h3 class="table-name">${e(t.name)}</h3>
      ${t.comment ? `<span class="table-comment">${e(t.comment)}</span>` : ''}
    </div>
    <div class="table-meta">
      <span class="meta-chip">~${HtmlRenderer.#fmt(t.row_estimate)} rows</span>
      <span class="meta-chip">${e(t.total_size)}</span>
      <span class="meta-chip">${(t.columns||[]).length} cols</span>
      ${(t.indexes||[]).length ? `<span class="meta-chip">${t.indexes.length} indexes</span>` : ''}
    </div>
  </div>

  <div class="table-scroll">
  <table class="cols-table">
    <thead>
      <tr><th>#</th><th>Column</th><th>Type</th><th>Nullable</th><th>Default</th><th>Comment</th></tr>
    </thead>
    <tbody>
      ${(t.columns||[]).map(c => `
      <tr class="${c.is_pk ? 'row-pk' : (c.is_unique ? 'row-unique' : '')}">
        <td class="col-num">${c.num}</td>
        <td class="col-name">
          ${c.is_pk     ? '<span class="badge-pk" title="Primary Key">PK</span>' : ''}
          ${c.is_unique && !c.is_pk ? '<span class="badge-uk" title="Unique">UK</span>' : ''}
          <span class="col-name-text">${e(c.name)}</span>
        </td>
        <td class="col-type">${e(c.type)}</td>
        <td class="col-null">${c.nullable ? '<span class="null-yes">YES</span>' : '<span class="null-no">NO</span>'}</td>
        <td class="col-default">${c.default_val ? `<code>${e(c.default_val)}</code>` : ''}</td>
        <td class="col-comment">${c.comment ? e(c.comment) : ''}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  </div>

  ${(t.indexes||[]).length ? HtmlRenderer.#indexesTable(t.indexes) : ''}
  ${(t.fks||[]).length     ? HtmlRenderer.#fkTable(t.fks)         : ''}
  ${(t.triggers||[]).length ? HtmlRenderer.#triggersTable(t.triggers) : ''}
</div>`;
  }

  static #indexesTable(indexes) {
    const e = HtmlRenderer.#esc;
    return `
  <div class="sub-section">
    <div class="sub-title">Indexes</div>
    <table class="simple-table">
      <thead><tr><th>Name</th><th>Type</th><th>Unique</th><th>Definition</th></tr></thead>
      <tbody>
        ${indexes.map(i => `
        <tr>
          <td><code>${e(i.name)}</code></td>
          <td><span class="idx-type">${e((i.type||'').toUpperCase())}</span></td>
          <td>${i.is_unique ? '✓' : ''}</td>
          <td class="idx-def"><code>${e(i.definition)}</code></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
  }

  static #fkTable(fks) {
    const e = HtmlRenderer.#esc;
    const s = HtmlRenderer.#slug;
    return `
  <div class="sub-section">
    <div class="sub-title">Foreign Keys</div>
    <table class="simple-table">
      <thead><tr><th>Name</th><th>Column</th><th>References</th><th>On Update</th><th>On Delete</th></tr></thead>
      <tbody>
        ${fks.map(fk => `
        <tr>
          <td><code>${e(fk.name)}</code></td>
          <td><code>${e(fk.column)}</code></td>
          <td><a href="#${s(fk.ref_schema, fk.ref_table)}" class="fk-link">${e(fk.ref_schema)}.${e(fk.ref_table)}.${e(fk.ref_column)}</a></td>
          <td>${FK_ACTION[fk.on_update] || e(fk.on_update)}</td>
          <td>${FK_ACTION[fk.on_delete] || e(fk.on_delete)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
  }

  static #triggersTable(triggers) {
    const e = HtmlRenderer.#esc;
    return `
  <div class="sub-section">
    <div class="sub-title">Triggers</div>
    <table class="simple-table">
      <thead><tr><th>Name</th><th>Timing</th><th>Event</th><th>Function</th></tr></thead>
      <tbody>
        ${triggers.map(tg => `
        <tr>
          <td><code>${e(tg.name)}</code></td>
          <td>${e(tg.timing)}</td>
          <td>${e(tg.event)}</td>
          <td><code>${e(tg.function_name)}</code></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
  }

  static #viewBlock(v) {
    const e = HtmlRenderer.#esc;
    const s = HtmlRenderer.#slug;
    return `
<div class="table-block" id="view-${s(v.schema, v.name)}">
  <div class="table-header">
    <div class="table-name-row">
      <h3 class="table-name"><span class="badge-view">VIEW</span> ${e(v.name)}</h3>
      <span class="table-comment">${e(v.schema)}</span>
    </div>
  </div>
  ${v.definition ? `<div class="code-block"><pre>${e(v.definition.trim())}</pre></div>` : ''}
</div>`;
  }

  static #functionBlock(f) {
    const e = HtmlRenderer.#esc;
    const s = HtmlRenderer.#slug;
    const jsdoc = f.jsdoc || { desc: '', params: [], returns: null };

    return `
<div class="table-block fn-block" id="fn-${s(f.schema, f.name)}">
  <div class="table-header">
    <div class="table-name-row">
      <h3 class="table-name">
        <span class="badge-fn">${e(f.kind || 'FN')}</span> ${e(f.name)}
      </h3>
    </div>
    <div class="table-meta">
      <span class="meta-chip">${e((f.language||'').toUpperCase())}</span>
      ${f.security_definer ? '<span class="meta-chip warn">SECURITY DEFINER</span>' : ''}
    </div>
  </div>

  <!-- Signature -->
  <div class="fn-sig">
    <code>${e(f.name)}(${e(f.arguments || '')})</code>
    <span class="fn-returns">→ ${e(f.return_type || 'void')}</span>
  </div>

  <!-- Description from @desc -->
  ${(jsdoc.desc || f.comment) ? `
  <div class="fn-desc">${e(jsdoc.desc || f.comment)}</div>` : ''}

  <!-- JSDoc parameter + return table -->
  ${HtmlRenderer.#jsdocTable(jsdoc)}

  <!-- Full function body -->
  ${f.body ? `
  <div class="fn-body-wrap">
    <div class="fn-body-title">Function Body</div>
    <div class="code-block"><pre>${e(f.body.trim())}</pre></div>
  </div>` : ''}
</div>`;
  }

  /**
   * Renders the JSDoc @param / @return table.
   * Only shown when the function body contains a JSDoc block.
   */
  static #jsdocTable(jsdoc) {
    const e = HtmlRenderer.#esc;
    const hasParams  = jsdoc.params?.length > 0;
    const hasReturns = jsdoc.returns != null;

    if (!hasParams && !hasReturns) return '';

    return `
  <div class="sub-section jsdoc-section">
    <div class="sub-title">Parameters &amp; Return</div>
    <table class="jsdoc-table">
      <thead>
        <tr>
          <th>Direction</th>
          <th>Name</th>
          <th>Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${(jsdoc.params||[]).map(p => `
        <tr class="jsdoc-param">
          <td><span class="dir-badge dir-in">IN</span></td>
          <td><code class="param-name">${e(p.name)}</code></td>
          <td><span class="param-type">${e(p.type)}</span></td>
          <td>${e(p.desc)}</td>
        </tr>`).join('')}
        ${hasReturns ? `
        <tr class="jsdoc-return">
          <td><span class="dir-badge dir-out">OUT</span></td>
          <td><code class="param-name">—</code></td>
          <td><span class="param-type">${e(jsdoc.returns.type)}</span></td>
          <td>${e(jsdoc.returns.desc)}</td>
        </tr>` : ''}
      </tbody>
    </table>
  </div>`;
  }

  static #typeCard(t) {
    const e = HtmlRenderer.#esc;
    return `
<div class="type-card">
  <div class="type-header">
    <span class="type-kind">${TYPE_KIND[t.kind] || e(t.kind)}</span>
    <span class="type-name">${e(t.name)}</span>
  </div>
  ${t.comment ? `<div class="type-comment">${e(t.comment)}</div>` : ''}
  ${(t.enum_values||[]).length ? `
  <div class="enum-values">
    ${t.enum_values.map(v => `<span class="enum-val">'${e(v)}'</span>`).join('')}
  </div>` : ''}
</div>`;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Utility helpers (all private static)
  // ════════════════════════════════════════════════════════════════════════

  static #esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  static #slug(schema, name) {
    return `${schema}-${name}`.replace(/[^a-z0-9_-]/gi, '_');
  }

  static #fmt(n) {
    if (n == null || n < 0) return '?';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }

  static #groupBySchema(tables) {
    const m = {};
    for (const t of tables) (m[t.schema] = m[t.schema] || []).push(t);
    return m;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Embedded CSS
  // ════════════════════════════════════════════════════════════════════════

  static #css() { return `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #ffffff; --surface: #f8f9fa; --surface2: #f1f3f4;
    --border: #e2e6ea; --text: #1a1d21; --muted: #6c757d;
    --accent: #2563eb; --accent-bg: #eff6ff;
    --green: #16a34a; --red: #dc2626;
    --sidebar-w: 280px;
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

  html { font-size: 14px; scroll-behavior: smooth; }
  body { font-family: var(--font); background: var(--bg); color: var(--text); line-height: 1.6; }

  .layout { display: flex; min-height: 100vh; }

  /* ── Sidebar ── */
  .sidebar {
    width: var(--sidebar-w); min-width: var(--sidebar-w);
    background: var(--surface); border-right: 1px solid var(--border);
    position: sticky; top: 0; height: 100vh; overflow-y: auto;
    display: flex; flex-direction: column;
    transition: transform 0.3s ease;
  }
  .sidebar::-webkit-scrollbar { width: 4px; }
  .sidebar::-webkit-scrollbar-thumb { background: var(--border); }
  .sidebar-header { padding: 18px 16px 12px; border-bottom: 1px solid var(--border); }
  .logo { font-size: 15px; font-weight: 700; color: var(--accent); }
  .db-name { font-size: 12px; color: var(--muted); font-family: var(--mono); }
  .db-dialect { font-size: 10px; color: var(--muted); opacity: .7; letter-spacing:.04em; text-transform: uppercase; }
  .search-wrap { padding: 10px 12px; border-bottom: 1px solid var(--border); }
  #search { width:100%; padding:6px 10px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font-size:12px; outline:none; }
  #search:focus { border-color: var(--accent); }
  nav { padding: 8px 0 20px; flex: 1; }
  .nav-schema { margin-bottom: 4px; }
  .nav-schema-label { font-size:10px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); padding:8px 16px 4px; }
  .nav-item { display:block; padding:5px 16px; font-size:13px; color:var(--muted); text-decoration:none; border-left:2px solid transparent; transition:all .15s; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .nav-item:hover { color:var(--text); background:var(--surface2); }
  .nav-item.active { color:var(--accent); border-left-color:var(--accent); background:var(--accent-bg); }
  .nav-item.hidden { display: none; }

  /* ── Main ── */
  main { flex:1; padding:32px 40px; max-width:1400px; overflow-x:hidden; width: 100%; }
  .page-header { margin-bottom: 28px; }
  .page-header h1 { font-size:24px; font-weight:700; margin-bottom:10px; }
  .meta-row { display:flex; flex-wrap:wrap; gap:6px; }

  /* ── Summary ── */
  .summary-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(140px,1fr)); gap:12px; margin-bottom:36px; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:16px; text-align:center; }
  .card-num { font-size:28px; font-weight:700; color:var(--accent); font-family:var(--mono); }
  .card-label { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }

  /* ── Badges ── */
  .badge { display:inline-flex; align-items:center; font-size:11px; padding:3px 8px; border-radius:4px; background:var(--surface2); border:1px solid var(--border); color:var(--muted); }
  .badge.muted { opacity:.7; }
  .badge-pk { display:inline-block; font-size:9px; font-weight:700; padding:1px 4px; border-radius:3px; background:#fef3c7; color:#92400e; border:1px solid #fde68a; margin-right:4px; }
  .badge-uk { display:inline-block; font-size:9px; font-weight:700; padding:1px 4px; border-radius:3px; background:#ede9fe; color:#5b21b6; border:1px solid #ddd6fe; margin-right:4px; }
  .badge-view { display:inline-block; font-size:10px; font-weight:600; padding:1px 6px; border-radius:3px; background:var(--accent-bg); color:var(--accent); margin-right:6px; }
  .badge-fn { display:inline-block; font-size:10px; font-weight:700; padding:1px 7px; border-radius:3px; background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; margin-right:6px; }

  /* ── Section ── */
  .section { margin-bottom:48px; }
  .section-title { font-size:18px; font-weight:600; margin-bottom:16px; padding-bottom:8px; border-bottom:2px solid var(--border); }
  .section-title.schema-title span { color: var(--accent); }

  /* ── Table block ── */
  .table-block { background:var(--surface); border:1px solid var(--border); border-radius:10px; margin-bottom:20px; overflow:hidden; }
  .table-header { display:flex; align-items:flex-start; justify-content:space-between; padding:14px 18px 12px; border-bottom:1px solid var(--border); gap:12px; flex-wrap:wrap; }
  .table-name-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .table-name { font-size:15px; font-weight:600; font-family:var(--mono); }
  .table-comment { font-size:12px; color:var(--muted); font-style:italic; }
  .table-meta { display:flex; gap:6px; flex-wrap:wrap; }
  .meta-chip { font-size:11px; padding:2px 8px; border-radius:4px; background:var(--surface2); border:1px solid var(--border); color:var(--muted); }
  .meta-chip.warn { background:#fef3c7; color:#92400e; border-color:#fde68a; }

  /* ── Columns table ── */
  .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .cols-table { width:100%; border-collapse:collapse; min-width: 600px; }
  .cols-table th { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); padding:8px 12px; text-align:left; background:var(--surface2); border-bottom:1px solid var(--border); font-weight:600; }
  .cols-table td { padding:8px 12px; border-bottom:1px solid var(--border); font-size:13px; vertical-align:middle; }
  .cols-table tr:last-child td { border-bottom: none; }
  .cols-table tr:hover td { background: var(--surface2); }
  .row-pk { background: rgba(234,179,8,.05); }
  .col-num { color:var(--muted); font-family:var(--mono); font-size:11px; }
  .col-name { white-space: nowrap; }
  .col-name-text { font-family:var(--mono); font-weight:500; }
  .col-type { font-family:var(--mono); color:var(--accent); white-space:nowrap; }
  .col-default code { font-family:var(--mono); font-size:12px; background:var(--surface2); padding:1px 5px; border-radius:3px; }
  .col-comment { color:var(--muted); font-style:italic; font-size:12px; }
  .null-yes { color:var(--muted); }
  .null-no { color:var(--red); font-weight:600; font-size:11px; }

  /* ── Sub sections ── */
  .sub-section { padding:0 18px 14px; border-top:1px solid var(--border); }
  .sub-title { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); padding:10px 0 8px; }
  .simple-table { width:100%; border-collapse:collapse; font-size:12px; min-width: 500px; }
  .simple-table th { color:var(--muted); text-align:left; padding:4px 8px; border-bottom:1px solid var(--border); font-size:11px; font-weight:600; }
  .simple-table td { padding:5px 8px; border-bottom:1px solid var(--border); }
  .simple-table tr:last-child td { border-bottom: none; }
  .simple-table code { font-family:var(--mono); background:var(--surface2); padding:1px 5px; border-radius:3px; font-size:11px; }
  .idx-type { font-size:10px; font-weight:600; padding:1px 5px; border-radius:3px; background:var(--surface2); border:1px solid var(--border); color:var(--muted); }
  .fk-link { color:var(--accent); text-decoration:none; font-family:var(--mono); }
  .fk-link:hover { text-decoration: underline; }

  /* ── Function ── */
  .fn-sig { padding:10px 18px; background:var(--surface2); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .fn-sig code { font-family:var(--mono); font-size:13px; }
  .fn-returns { font-family:var(--mono); font-size:12px; color:var(--green); font-weight:600; }
  .fn-desc { padding:12px 18px; font-size:13px; color:var(--text); line-height:1.7; border-bottom:1px solid var(--border); background:var(--surface); }

  /* ── JSDoc table ── */
  .jsdoc-section { }
  .jsdoc-table { width:100%; border-collapse:collapse; font-size:13px; }
  .jsdoc-table th { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); padding:7px 12px; text-align:left; background:var(--surface2); border-bottom:1px solid var(--border); font-weight:600; }
  .jsdoc-table td { padding:9px 12px; border-bottom:1px solid var(--border); vertical-align:top; }
  .jsdoc-table tr:last-child td { border-bottom: none; }
  .jsdoc-param td { background: rgba(37,99,235,.03); }
  .jsdoc-return td { background: rgba(22,163,74,.03); }
  .jsdoc-table tr:hover td { filter: brightness(.97); }
  .dir-badge { display:inline-block; font-size:9px; font-weight:700; padding:2px 7px; border-radius:3px; letter-spacing:.06em; }
  .dir-in  { background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; }
  .dir-out { background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; }
  .param-name { font-family:var(--mono); font-size:12px; font-weight:600; }
  .param-type { font-family:var(--mono); font-size:11px; padding:2px 7px; border-radius:3px; background:var(--surface2); border:1px solid var(--border); color:var(--accent); }

  /* ── Function body ── */
  .fn-body-wrap { border-top:1px solid var(--border); }
  .fn-body-title { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); padding:10px 18px 0; }
  .code-block { padding:14px 18px; background:var(--bg); }
  .code-block pre { font-family:var(--mono); font-size:12px; line-height:1.65; color:var(--muted); white-space:pre-wrap; word-break:break-word; }

  /* ── Types ── */
  .types-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px,1fr)); gap:12px; }
  .type-card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:14px; }
  .type-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
  .type-kind { font-size:9px; font-weight:700; padding:2px 6px; border-radius:3px; background:var(--accent-bg); color:var(--accent); border:1px solid; letter-spacing:.06em; }
  .type-name { font-family:var(--mono); font-weight:600; font-size:13px; }
  .type-comment { font-size:12px; color:var(--muted); font-style:italic; margin-bottom:6px; }
  .enum-values { display:flex; flex-wrap:wrap; gap:4px; }
  .enum-val { font-family:var(--mono); font-size:11px; background:var(--surface2); border:1px solid var(--border); padding:2px 6px; border-radius:3px; color:var(--green); }

  /* ── Extensions ── */
  .ext-row { display:flex; flex-wrap:wrap; gap:8px; }
  .ext-badge { font-size:12px; padding:4px 10px; border-radius:6px; background:var(--surface2); border:1px solid var(--border); font-family:var(--mono); }
  .ext-badge em { color:var(--muted); font-style:normal; }

  /* ── Responsive Design ── */
  
  /* Large screens (1400px and up) */
  @media (min-width: 1400px) {
    html { font-size: 15px; }
    main { padding: 40px 60px; }
    .summary-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
    .types-grid { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
  }

  /* Medium-large screens (1200px to 1399px) */
  @media (min-width: 1200px) and (max-width: 1399px) {
    html { font-size: 14px; }
    main { padding: 32px 40px; }
  }

  /* Medium screens (992px to 1199px) */
  @media (min-width: 992px) and (max-width: 1199px) {
    html { font-size: 13px; }
    main { padding: 28px 32px; }
    .summary-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
    :root { --sidebar-w: 260px; }
  }

  /* Small tablets (768px to 991px) */
  @media (min-width: 768px) and (max-width: 991px) {
    html { font-size: 13px; }
    .layout { flex-direction: row; }
    .sidebar { 
      width: 240px; 
      min-width: 240px; 
      position: sticky;
    }
    main { padding: 24px 28px; }
    .summary-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
    .types-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    .table-header { flex-direction: column; align-items: flex-start; }
    .table-meta { margin-top: 8px; }
  }

  /* Mobile devices (up to 767px) */
  @media (max-width: 767px) {
    html { font-size: 12px; }
    .layout { flex-direction: column; }
    .sidebar { 
      width: 100%; 
      min-width: 100%; 
      height: auto; 
      position: relative; 
      max-height: none;
    }
    .sidebar-header { padding: 14px 16px 10px; }
    .logo { font-size: 14px; }
    .db-name { font-size: 11px; }
    nav { padding: 8px 0 16px; }
    .nav-schema-label { font-size: 9px; padding: 6px 16px 4px; }
    .nav-item { font-size: 12px; padding: 4px 16px; }
    main { padding: 20px 16px; }
    .page-header h1 { font-size: 20px; }
    .summary-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .card { padding: 12px; }
    .card-num { font-size: 24px; }
    .card-label { font-size: 10px; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 16px; }
    .table-block { border-radius: 8px; }
    .table-header { padding: 12px 14px 10px; }
    .table-name { font-size: 14px; }
    .table-comment { font-size: 11px; }
    .meta-chip { font-size: 10px; padding: 2px 6px; }
    .cols-table th { font-size: 10px; padding: 6px 10px; }
    .cols-table td { font-size: 12px; padding: 6px 10px; }
    .simple-table { font-size: 11px; }
    .simple-table th { font-size: 9px; padding: 3px 6px; }
    .simple-table td { font-size: 11px; padding: 4px 6px; }
    .fn-sig { padding: 8px 14px; flex-direction: column; align-items: flex-start; }
    .fn-sig code { font-size: 12px; }
    .fn-returns { font-size: 11px; }
    .fn-desc { padding: 10px 14px; font-size: 12px; }
    .jsdoc-table { font-size: 12px; }
    .jsdoc-table th { font-size: 9px; padding: 6px 10px; }
    .jsdoc-table td { font-size: 11px; padding: 7px 10px; }
    .code-block { padding: 12px 14px; }
    .code-block pre { font-size: 11px; }
    .types-grid { grid-template-columns: 1fr; gap: 10px; }
    .type-card { padding: 12px; }
    .sub-section { padding: 0 14px 12px; }
    .sub-title { font-size: 10px; }
    .badge { font-size: 10px; padding: 2px 6px; }
    .badge-pk, .badge-uk { font-size: 8px; padding: 1px 3px; }
    .badge-view, .badge-fn { font-size: 9px; padding: 1px 5px; }
    .dir-badge { font-size: 8px; padding: 1px 5px; }
    .param-name { font-size: 11px; }
    .param-type { font-size: 10px; }
    .ext-badge { font-size: 11px; padding: 3px 8px; }
  }

  /* Extra small devices (up to 480px) */
  @media (max-width: 480px) {
    html { font-size: 11px; }
    main { padding: 16px 12px; }
    .summary-grid { grid-template-columns: 1fr; }
    .card { padding: 10px; }
    .card-num { font-size: 20px; }
    .page-header h1 { font-size: 18px; }
    .table-name { font-size: 13px; }
    .cols-table { min-width: 100%; }
    .simple-table { min-width: 100%; }
    .fn-sig code { font-size: 11px; }
    .code-block pre { font-size: 10px; }
  }

  /* Print styles */
  @media print {
    .sidebar { display: none; }
    main { padding: 20px; max-width: 100%; }
    .table-block { break-inside: avoid; }
    .section { break-inside: avoid; }
  }
`; }

  // ════════════════════════════════════════════════════════════════════════
  // Embedded JS
  // ════════════════════════════════════════════════════════════════════════

  static #js() { return `
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
        const a = document.querySelector('.nav-item[href="#' + e.target.id + '"]');
        if (a) { a.classList.add('active'); a.scrollIntoView({ block:'nearest' }); }
      }
    });
  }, { rootMargin: '-15% 0px -70% 0px' });

  document.querySelectorAll('.table-block').forEach(el => obs.observe(el));

  function doSearch(q) {
    q = q.toLowerCase().trim();
    document.querySelectorAll('.nav-item').forEach(a => {
      a.classList.toggle('hidden', !!q && !a.textContent.toLowerCase().includes(q));
    });
  }
`; }
}
