'use strict';

/** Mock viewer-request URI rewrite (see viewerrequestlambda/index.js). */
function rewriteUri(path, { prefix, d, quality, webp }) {
  const base = path.replace(/^\/images\//, '');
  const ext = webp ? 'webp' : 'jpg';
  const segment = d ? `${d}_q${quality}` : 'original';
  return `/${prefix}/variants/${segment}/${base}.${ext}`;
}

/** Mock origin-response: 404 triggers resize + S3 cache (see originresponselambda/index.js). */
function originOn404(originalKey, variantKey) {
  return {
    action: 'generate_and_cache',
    source: originalKey,
    destination: variantKey,
    note: 'In production: Sharp resize, S3 putObject, return 200 to CloudFront',
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { path = '/images/photo.jpg', prefix = 'assets/demo', d = '400x300', quality = 80, webp = true } =
    req.body || {};

  const originalKey = `${prefix}${path}`;
  const rewrittenUri = rewriteUri(path, { prefix, d, quality, webp });
  const variantKey = `${prefix}${rewrittenUri}`;

  const steps = [
    {
      title: '1. Viewer request (Lambda@Edge)',
      description: 'CloudFront invokes viewer-request before origin fetch.',
      detail: `Rewrite ${path} → ${rewrittenUri}`,
    },
    {
      title: '2. CloudFront → S3',
      description: 'CDN requests the variant key from S3.',
      detail: `GET s3://bucket/${variantKey}`,
    },
    {
      title: '3. Origin response on 404',
      description: 'Missing variant triggers origin-response Lambda.',
      detail: JSON.stringify(originOn404(originalKey, variantKey)),
    },
    {
      title: '4. Response to browser',
      description: 'Generated image returned; subsequent requests hit cached variant.',
      detail: 'HTTP 200, Content-Type: image/webp or image/jpeg',
    },
  ];

  return res.status(200).json({
    mode: 'simulation',
    awsRequired: ['S3_BUCKET', 'CloudFront viewer-request + origin-response triggers', 'IAM s3:GetObject/PutObject'],
    input: { path, prefix, d, quality, webp },
    rewrittenUri,
    steps,
  });
};
