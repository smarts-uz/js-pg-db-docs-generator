// src/JsDocParser.js

/**
 * Parses JSDoc-style comments embedded in SQL function bodies.
 *
 * Supported tags:
 *   @desc   — function description (multi-line supported)
 *   @param  {type} name  description
 *   @return {type}       description
 */
export class JsDocParser {
  /**
   * Extract the first JSDoc block ( /** … *\/ ) from a SQL string.
   * @param {string} body  Raw function source
   * @returns {string|null}  Content inside the comment, or null
   */
  static extractBlock(body) {
    if (!body) return null;
    const match = body.match(/\/\*\*([\s\S]*?)\*\//);
    return match ? match[1] : null;
  }

  /**
   * Parse a JSDoc block into structured data.
   * @param {string} body  Raw function source
   * @returns {{ desc: string, params: ParsedParam[], returns: ParsedReturn|null }}
   */
  static parse(body) {
    const block = JsDocParser.extractBlock(body);
    const result = { desc: '', params: [], returns: null };
    if (!block) return result;

    // Split into logical lines, strip leading " * "
    const lines = block
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trimEnd());

    let mode   = 'desc';   // current tag context
    let descLines = [];

    for (const line of lines) {
      // ── @desc ────────────────────────────────────────────────────────────
      if (/^@desc\b/.test(line)) {
        mode = 'desc';
        const rest = line.replace(/^@desc\s*/, '');
        if (rest) descLines.push(rest);
        continue;
      }

      // ── @param {type} name  description ─────────────────────────────────
      const paramMatch = line.match(/^@param\s+\{([^}]+)\}\s+(\S+)\s*(.*)/);
      if (paramMatch) {
        mode = 'param';
        result.params.push({
          type: paramMatch[1].trim(),
          name: paramMatch[2].trim(),
          desc: paramMatch[3].trim(),
        });
        continue;
      }

      // ── @return / @returns ───────────────────────────────────────────────
      const retMatch = line.match(/^@returns?\s+\{([^}]+)\}\s*(.*)/);
      if (retMatch) {
        mode = 'return';
        result.returns = {
          type: retMatch[1].trim(),
          desc: retMatch[2].trim(),
        };
        continue;
      }

      // ── Continuation line (no tag) ───────────────────────────────────────
      if (line.trim() === '') continue;

      if (mode === 'desc') {
        descLines.push(line.trim());
      } else if (mode === 'param' && result.params.length) {
        // Continuation of last @param description
        const last = result.params[result.params.length - 1];
        last.desc += (last.desc ? ' ' : '') + line.trim();
      } else if (mode === 'return' && result.returns) {
        result.returns.desc += (result.returns.desc ? ' ' : '') + line.trim();
      }
    }

    result.desc = descLines.join(' ').trim();
    return result;
  }
}
