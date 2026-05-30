const form = document.getElementById('demo-form');
const stepsEl = document.getElementById('steps');
const out = document.getElementById('out');
const submitBtn = form.querySelector('button[type="submit"]');

let animationAbort = null;

const FLOW_NODES = [
  { id: 'browser', label: 'Browser', icon: '◉' },
  { id: 'cloudfront', label: 'CloudFront', icon: '☁' },
  { id: 'viewer-lambda', label: 'λ Viewer', icon: 'λ' },
  { id: 's3', label: 'S3', icon: '▣' },
  { id: 'origin-lambda', label: 'λ Origin', icon: 'λ' },
];

const FLOW_STAGES = [
  {
    nodes: ['browser', 'cloudfront', 'viewer-lambda'],
    arrows: ['browser-cloudfront', 'cloudfront-viewer-lambda'],
    status: 'Viewer request… invoking Lambda@Edge',
    loaderMs: 1100,
    revealMs: 600,
  },
  {
    nodes: ['cloudfront', 'viewer-lambda', 's3'],
    arrows: ['cloudfront-viewer-lambda', 'viewer-lambda-s3'],
    status: 'Fetching variant from S3…',
    loaderMs: 1300,
    revealMs: 600,
  },
  {
    nodes: ['s3', 'origin-lambda'],
    arrows: ['s3-origin-lambda'],
    status: '404 — origin-response processing with Sharp…',
    loaderMs: 1500,
    revealMs: 600,
  },
  {
    nodes: ['browser', 'cloudfront', 's3', 'origin-lambda'],
    arrows: ['browser-cloudfront', 'viewer-lambda-s3', 's3-origin-lambda'],
    status: 'Delivering cached response to browser…',
    loaderMs: 1000,
    revealMs: 500,
  },
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function renderFlowDiagram() {
  const nodeHtml = FLOW_NODES.map(
    (node, i) => `
      <div class="flow-node" data-node="${node.id}" id="node-${node.id}">
        <span class="flow-node-icon" aria-hidden="true">${node.icon}</span>
        <span class="flow-node-label">${escapeHtml(node.label)}</span>
      </div>
      ${i < FLOW_NODES.length - 1 ? `<div class="flow-arrow" data-arrow="${FLOW_NODES[i].id}-${FLOW_NODES[i + 1].id}" aria-hidden="true"><span class="flow-arrow-line"></span><span class="flow-arrow-head">›</span></div>` : ''}`,
  ).join('');

  return `
    <div class="flow-diagram" role="img" aria-label="S3, CloudFront, and Lambda@Edge pipeline">
      ${nodeHtml}
    </div>
  `;
}

function renderStepCard(step, index) {
  return `
    <article class="step flow-step" data-step-index="${index}" hidden>
      <div class="step-header">
        <span class="step-badge">${index + 1}</span>
        <h3>${escapeHtml(step.title.replace(/^\d+\.\s*/, ''))}</h3>
      </div>
      <p>${escapeHtml(step.description)}</p>
      <code>${escapeHtml(step.detail || '')}</code>
      ${step.meta ? `<p class="meta">${escapeHtml(step.meta)}</p>` : ''}
    </article>
  `;
}

function buildStepsShell(data) {
  return `
    <div class="flow-header">
      <h2>Pipeline simulation</h2>
      <div class="flow-progress" aria-label="Simulation progress">
        <div class="flow-progress-track">
          <div class="flow-progress-bar" id="flow-progress-bar"></div>
        </div>
        <span class="flow-progress-label" id="flow-progress-label">0 / ${data.steps.length}</span>
      </div>
    </div>

    ${renderFlowDiagram()}

    <div class="flow-status" id="flow-status">
      <span class="flow-spinner" aria-hidden="true"></span>
      <span class="flow-status-text" id="flow-status-text">Starting simulation…</span>
    </div>

    <p class="uri uri-pending" id="flow-uri">
      <strong>Rewritten URI:</strong> <code class="uri-placeholder">pending…</code>
    </p>

    <div class="flow-steps-scroll" id="flow-steps-scroll">
      <div class="flow-steps-list" id="flow-steps-list">
        ${data.steps.map(renderStepCard).join('')}
      </div>
    </div>
  `;
}

function setActiveNodes(activeIds, activeArrows) {
  document.querySelectorAll('.flow-node').forEach((el) => {
    el.classList.toggle('active', activeIds.includes(el.dataset.node));
  });
  document.querySelectorAll('.flow-arrow').forEach((el) => {
    el.classList.toggle('active', activeArrows.includes(el.dataset.arrow));
  });
}

function setProgress(current, total) {
  const bar = document.getElementById('flow-progress-bar');
  const label = document.getElementById('flow-progress-label');
  if (!bar || !label) return;
  const pct = total ? (current / total) * 100 : 0;
  bar.style.width = `${pct}%`;
  label.textContent = `${current} / ${total}`;
}

function setStatus(text, loading = true) {
  const statusEl = document.getElementById('flow-status');
  const textEl = document.getElementById('flow-status-text');
  if (!statusEl || !textEl) return;
  statusEl.classList.toggle('is-loading', loading);
  textEl.textContent = text;
}

function revealStep(index) {
  const step = document.querySelector(`.flow-step[data-step-index="${index}"]`);
  if (!step) return;
  step.hidden = false;
  step.classList.add('revealed');
  const scroll = document.getElementById('flow-steps-scroll');
  if (scroll) {
    requestAnimationFrame(() => {
      step.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
}

function showRewrittenUri(uri) {
  const uriEl = document.getElementById('flow-uri');
  if (!uriEl) return;
  uriEl.classList.remove('uri-pending');
  uriEl.innerHTML = `<strong>Rewritten URI:</strong> <code>${escapeHtml(uri)}</code>`;
}

async function animateFlow(data, signal) {
  const total = data.steps.length;

  for (let i = 0; i < FLOW_STAGES.length; i++) {
    const stage = FLOW_STAGES[i];
    setActiveNodes(stage.nodes, stage.arrows);
    setStatus(stage.status, true);
    setProgress(i, total);

    if (i === 0 && data.rewrittenUri) {
      await sleep(stage.loaderMs / 2, signal);
      showRewrittenUri(data.rewrittenUri);
      await sleep(stage.loaderMs / 2, signal);
    } else {
      await sleep(stage.loaderMs, signal);
    }

    revealStep(i);
    setProgress(i + 1, total);
    setStatus(`Step ${i + 1} complete`, false);
    await sleep(stage.revealMs, signal);
  }

  setActiveNodes([], []);
  setStatus('Simulation complete', false);
  document.getElementById('flow-status')?.classList.add('is-complete');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (animationAbort) {
    animationAbort.abort();
  }
  animationAbort = new AbortController();
  const { signal } = animationAbort;

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
  stepsEl.innerHTML = `
    <div class="flow-header">
      <h2>Pipeline simulation</h2>
      <div class="flow-progress">
        <div class="flow-progress-track">
          <div class="flow-progress-bar" style="width: 0%"></div>
        </div>
        <span class="flow-progress-label">0 / 4</span>
      </div>
    </div>
    ${renderFlowDiagram()}
    <div class="flow-status is-loading">
      <span class="flow-spinner" aria-hidden="true"></span>
      <span class="flow-status-text">Connecting to simulation API…</span>
    </div>
  `;
  out.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Simulating…';

  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || res.statusText);
    }

    stepsEl.innerHTML = buildStepsShell(data);
    out.textContent = JSON.stringify(data, null, 2);
    await animateFlow(data, signal);
  } catch (err) {
    if (err.name === 'AbortError') return;
    stepsEl.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    out.textContent = '';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Simulate flow';
  }
});
