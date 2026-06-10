const allowedTags = new Set(['br', 'em', 'li', 'ol', 'p', 'strong', 'u', 'ul']);
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

export const getRichTextPlainText = (html: string) => {
  if (typeof window === 'undefined') {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const document = createEmptyDocument();
  const container = document.createElement('div');

  container.innerHTML = sanitizeRichTextHtml(html);

  return (container.textContent ?? '').replace(/\s+/g, ' ').trim();
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
