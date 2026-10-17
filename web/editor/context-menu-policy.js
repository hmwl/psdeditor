
const documents = new WeakSet(), frames = new WeakSet();

export function installContextMenuPolicy(doc = document) {
  if (!doc || documents.has(doc)) return;
  const win = doc.defaultView;
  if (!win) return;
  documents.add(doc);
  doc.addEventListener('contextmenu', event => event.preventDefault(), { capture: true, passive: false });
  doc.addEventListener('keydown', event => {
    const contextKey = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
    if (!contextKey || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (event.repeat) return;
    const target = event.composedPath?.()[0] || doc.activeElement || doc.body;
    if (!target?.dispatchEvent) return;
    const bounds = target.getBoundingClientRect?.();
    target.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true,
      view: win, button: 2, clientX: bounds ? bounds.left + Math.min(12, bounds.width / 2) : 0,
      clientY: bounds ? bounds.top + Math.min(12, bounds.height / 2) : 0 }));
  }, { capture: true, passive: false });

  const connectFrame = frame => {
    if (!frames.has(frame)) {
      frames.add(frame);
      frame.addEventListener('load', () => connectFrame(frame));
    }
    try { if (frame.contentDocument) installContextMenuPolicy(frame.contentDocument); } catch {  }
  };
  const discover = root => {
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.matches?.('iframe, frame')) connectFrame(root);
    for (const frame of root.querySelectorAll?.('iframe, frame') || []) connectFrame(frame);
  };
  
  doc.addEventListener('load', event => {
    if (event.target?.matches?.('iframe, frame')) connectFrame(event.target);
  }, true);
  discover(doc);
  new win.MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') connectFrame(record.target);
      else for (const node of record.addedNodes) discover(node);
    }
  }).observe(doc, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcdoc'] });
}

if (typeof document !== 'undefined') installContextMenuPolicy(document);
