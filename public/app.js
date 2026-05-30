const form = document.getElementById('demo-form');
const stepsEl = document.getElementById('steps');
const out = document.getElementById('out');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const body = {
    path: fd.get('path'),
    prefix: fd.get('prefix'),
    d: fd.get('d'),
    quality: Number(fd.get('quality')),
    webp: fd.get('webp') === 'on',
  };
  stepsEl.innerHTML = '<p>Running simulation…</p>';
  const res = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  stepsEl.innerHTML = data.steps
    .map(
      (s) =>
        `<article class="step"><h3>${s.title}</h3><p>${s.description}</p><code>${s.detail || ''}</code></article>`,
    )
    .join('');
  out.textContent = JSON.stringify(data, null, 2);
  out.hidden = false;
});
