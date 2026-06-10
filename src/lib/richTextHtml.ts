const allowedTags = new Set(['br', 'em', 'li', 'ol', 'p', 'strong', 'u', 'ul']);
const lineBreakTags = new Set(['br']);
const blockTextTags = new Set(['li', 'p']);
const tagAliases = new Map([
  ['b', 'strong'],
  ['div', 'p'],
  ['i', 'em'],
]);

const createEmptyDocument = () => document.implementation.createHTMLDocument('');

const appendSanitizedNode = (source: Node, targetParent: Node, targetDocument: Document) => {
  if (source.nodeType === Node.TEXT_NODE) {
    targetParent.appendChild(targetDocument.createTextNode(source.textContent ?? ''));
    return;
  }

  if (source.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = source as HTMLElement;
  const rawTagName = element.tagName.toLowerCase();
  const tagName = tagAliases.get(rawTagName) ?? rawTagName;

  if (!allowedTags.has(tagName)) {
    Array.from(element.childNodes).forEach((child) =>
      appendSanitizedNode(child, targetParent, targetDocument),
    );
    return;
  }

  const sanitizedElement = targetDocument.createElement(tagName);
  targetParent.appendChild(sanitizedElement);
  Array.from(element.childNodes).forEach((child) =>
    appendSanitizedNode(child, sanitizedElement, targetDocument),
  );
};

export const sanitizeRichTextHtml = (html: string) => {
  if (typeof window === 'undefined') {
    return html;
  }

  const parser = new DOMParser();
  const sourceDocument = parser.parseFromString(html || '<p></p>', 'text/html');
  const targetDocument = createEmptyDocument();
  const container = targetDocument.createElement('div');

  Array.from(sourceDocument.body.childNodes).forEach((child) =>
    appendSanitizedNode(child, container, targetDocument),
  );

  return container.innerHTML.trim();
};

const normalizePlainText = (value: string) =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const appendPlainText = (source: Node, parts: string[]) => {
  if (source.nodeType === Node.TEXT_NODE) {
    parts.push(source.textContent ?? '');
    return;
  }

  if (source.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = source as HTMLElement;
  const tagName = tagAliases.get(element.tagName.toLowerCase()) ?? element.tagName.toLowerCase();

  if (lineBreakTags.has(tagName)) {
    parts.push('\n');
    return;
  }

  Array.from(element.childNodes).forEach((child) => appendPlainText(child, parts));

  if (blockTextTags.has(tagName)) {
    parts.push('\n');
  }
};

export const getRichTextPlainText = (html: string) => {
  if (typeof window === 'undefined') {
    return html
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(div|li|p)\s*>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const document = createEmptyDocument();
  const container = document.createElement('div');
  const parts: string[] = [];

  container.innerHTML = sanitizeRichTextHtml(html);
  Array.from(container.childNodes).forEach((child) => appendPlainText(child, parts));

  return normalizePlainText(parts.join(''));
};

export const plainTextToRichTextHtml = (value: string) => {
  const lines = value.replace(/\r\n/g, '\n').split('\n');

  return lines
    .map((line) => {
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      return `<p>${escaped || '<br>'}</p>`;
    })
    .join('');
};
