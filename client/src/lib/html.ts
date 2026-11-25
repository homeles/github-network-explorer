/**
 * Escape a value for safe interpolation into an HTML string.
 *
 * Tooltips are built as HTML strings (innerHTML / d3 `.html()`), and several
 * interpolated values come straight from Git data that any repository author
 * controls: commit messages, author names, branch names and file paths. Every
 * such value must go through this helper before it is placed in markup.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
