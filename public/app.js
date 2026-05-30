const form = document.getElementById('demo-form');
const stepsEl = document.getElementById('steps');
const out = document.getElementById('out');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const body = {
    path: fd.get('path'),
    prefix: fd.get('prefix'),
    d: fd.get('d'),
    quality: Number(fd.get('quality')),
    acceptHeader: fd.get('acceptHeader'),
    userAgentSupportsWebp: fd.get('userAgentSupportsWebp') === 'on',
  };

  stepsEl.hidden = false;
  stepsEl.innerHTML = '<p class="loading">Running simulation…</p>';

  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || res.statusText);
    }

    stepsEl.innerHTML = `
      <h2>Pipeline steps</h2>
      <p class="uri"><strong>Rewritten URI:</strong> <code>${escapeHtml(data.rewrittenUri)}</code></p>
      ${data.steps
        .map(
          (s) => `
        <article class="step">
          <h3>${escapeHtml(s.title)}</h3>
          <p>${escapeHtml(s.description)}</p>
          <code>${escapeHtml(s.detail || '')}</code>
          ${s.meta ? `<p class="meta">${escapeHtml(s.meta)}</p>` : ''}
        </article>`,
        )
        .join('')}
    `;
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    stepsEl.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    out.textContent = '';
  }
});
