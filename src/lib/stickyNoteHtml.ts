const allowedTags = new Set(['br', 'em', 'li', 'ol', 'p', 'strong', 'u', 'ul']);

const tagAliases: Record<string, string> = {
  b: 'strong',
  div: 'p',
  i: 'em',
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const plainTextToStickyNoteHtml = (value: string) =>
  value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');

const sanitizeNode = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const originalTagName = element.tagName.toLowerCase();
  const tagName = tagAliases[originalTagName] ?? originalTagName;
  const children = Array.from(element.childNodes).map(sanitizeNode).join('');

  if (!allowedTags.has(tagName)) {
    return children;
  }

  if (tagName === 'br') {
    return '<br>';
  }

  return `<${tagName}>${children}</${tagName}>`;
};

export const sanitizeStickyNoteHtml = (html: string) => {
  const value = html.trim();

  if (!value) {
    return '';
  }

  if (typeof DOMParser === 'undefined') {
    return escapeHtml(value).replace(/\n/g, '<br>');
  }

  const doc = new DOMParser().parseFromString(value, 'text/html');

  return Array.from(doc.body.childNodes).map(sanitizeNode).join('').trim();
};

export const getStickyNoteText = (html: string) => {
  if (!html.trim()) {
    return '';
  }

  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const doc = new DOMParser().parseFromString(sanitizeStickyNoteHtml(html), 'text/html');

  return doc.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
};
