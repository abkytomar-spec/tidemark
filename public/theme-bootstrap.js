(() => {
  let appearance = 'system';
  try { appearance = localStorage.getItem('tidemark-appearance') || appearance; } catch { /* storage is optional */ }
  const dark = appearance === 'dark' || (appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
