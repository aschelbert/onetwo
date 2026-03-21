/**
 * Isolates a specific element for printing by marking it and its
 * ancestor chain, so CSS can hide only sibling branches while
 * preserving the full layout inside the report content.
 */
export function printReport(el: HTMLElement | null) {
  if (!el) return;

  document.body.classList.add('printing-report');
  el.classList.add('print-report-active');

  // Mark every ancestor between the element and <body> so CSS can
  // keep them visible while hiding their siblings.
  const ancestors: HTMLElement[] = [];
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    parent.classList.add('print-report-ancestor');
    ancestors.push(parent);
    parent = parent.parentElement;
  }

  const cleanup = () => {
    document.body.classList.remove('printing-report');
    el.classList.remove('print-report-active');
    ancestors.forEach(a => a.classList.remove('print-report-ancestor'));
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  window.print();
}
