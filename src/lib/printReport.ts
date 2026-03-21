/**
 * Isolates a specific element for printing by toggling CSS classes.
 * Works with the `body.printing-report` / `.print-report-active` rules in index.css.
 */
export function printReport(el: HTMLElement | null) {
  if (!el) return;

  document.body.classList.add('printing-report');
  el.classList.add('print-report-active');

  const cleanup = () => {
    document.body.classList.remove('printing-report');
    el.classList.remove('print-report-active');
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  window.print();
}
