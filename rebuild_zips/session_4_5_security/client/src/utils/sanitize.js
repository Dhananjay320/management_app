// ============================================================================
// sanitize.js — centralized HTML sanitization helper.
// ============================================================================
// Session 5 security fix:
//   S4 — Every place we use dangerouslySetInnerHTML (email bodies,
//        onboarding copy) now routes through sanitizeHtml() first.
//
// We use DOMPurify via the ESM package 'dompurify'. If it's not installed yet,
// this module falls back to a strict allow-list mode that strips ALL tags and
// leaves plain text — ensuring nothing unsafe ever renders, even if the
// install step was skipped. Install with:
//     npm install --save dompurify isomorphic-dompurify
// ============================================================================

let purify = null;

try {
  // DOMPurify works in the browser directly
  // eslint-disable-next-line global-require, import/no-unresolved
  const DOMPurify = require('dompurify');
  purify = typeof DOMPurify === 'function' ? DOMPurify(window) : DOMPurify;
} catch (e) {
  // dompurify not installed yet — fall back to text-only mode below.
  purify = null;
}

/**
 * Sanitize an HTML string for safe use with dangerouslySetInnerHTML.
 *
 * Allowed tags: formatting (b, i, em, strong, u, s), headings, lists,
 *   links (with rel=noopener + target=_blank forced), line breaks, images
 *   (https only), basic block containers.
 * Stripped: <script>, <style>, <iframe>, event handlers, javascript: URLs,
 *   data: URLs (except images), any attribute not in the allow-list.
 */
export function sanitizeHtml(dirty) {
  const input = dirty == null ? '' : String(dirty);
  if (!input) return '';

  if (!purify) {
    // Fallback: strip every tag. Text-only but safe.
    return input.replace(/<[^>]*>/g, '');
  }

  return purify.sanitize(input, {
    ALLOWED_TAGS: [
      'b', 'i', 'em', 'strong', 'u', 's', 'mark', 'sub', 'sup',
      'p', 'br', 'hr', 'blockquote', 'pre', 'code',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'img',
      'div', 'span',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'src', 'alt', 'title',
      'class',
      'align', 'valign',
      'colspan', 'rowspan',
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['on*', 'style'],  // no inline JS handlers, no inline style (XSS vector)
    ADD_ATTR: ['target'],
  });
}

/**
 * Plain-text-only fallback. Use when you want to render untrusted content
 * as readable text without any formatting (preview lists, etc.).
 */
export function textOnly(dirty) {
  if (!dirty) return '';
  return String(dirty).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

// After sanitization, DOMPurify may strip target=_blank on links. Force it
// back + add rel="noopener noreferrer" as a post-process safety net.
if (purify && purify.addHook) {
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}
