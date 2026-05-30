'use strict';

const path = require('path');

const WEBP_EXTENSION = 'webp';

/** Mirrors viewerrequestlambda/index.js rewrite rules. */
function rewriteViewerRequest(requestUri, queryParams, { acceptHeader, userAgentSupportsWebp }) {
  const params = queryParams || {};
  let fwdUri = requestUri;

  if (userAgentSupportsWebp) {
    fwdUri = fwdUri.replace(`.${path.extname(requestUri)}`, `.${WEBP_EXTENSION}`);
  }

  const storagePrefix = params.prefix || params.project;
  if (!storagePrefix) {
    return {
      fwdUri,
      unchanged: true,
      originalResourceType: null,
      note: 'No prefix/project query param — request passes through unchanged.',
    };
  }

  const match = fwdUri.match(/(images)\/(.*)(.*)\.(.*)/);
  if (!match) {
    return {
      fwdUri,
      unchanged: true,
      originalResourceType: null,
      note: 'URI does not match images/… pattern — no rewrite.',
    };
  }

  const prefix = match[1];
  const pathSegment = match[2] !== '' ? match[2].substring(1) : null;
  const imageName = match[3];
  let extension = match[4];
  const accept = acceptHeader || '';
  const urlParts = [prefix];

  if (pathSegment) urlParts.push(pathSegment);
  if (params.d) urlParts.push('resized');
  if (accept.includes(WEBP_EXTENSION)) {
    extension = WEBP_EXTENSION;
    urlParts.push(WEBP_EXTENSION);
  } else if (params.quality) {
    urlParts.push(extension);
  }

  if (params.d) {
    const [width, height] = params.d.split('x');
    urlParts.push(`${imageName}-${width}x${height}.${extension}`);
  } else {
    urlParts.push(`${imageName}.${extension}`);
  }

  fwdUri = `/${urlParts.join('/')}`;
  const fileFormat = path.extname(requestUri).replace('.', '');
  const originalResourceType = `image/${fileFormat}`;

  return {
    fwdUri,
    unchanged: false,
    originalResourceType,
    header: { key: 'Original-Resource-Type', value: originalResourceType },
  };
}

/** Mirrors originresponselambda/index.js 404 branch (conceptual). */
function originOn404(originalKey, variantKey, quality) {
  return {
    action: 'generate_and_cache',
    source: originalKey,
    destination: variantKey,
    sharp: { resize: true, quality: quality ?? 80 },
    note: 'Production: S3 getObject original → Sharp resize → putObject variant → 200 to CloudFront',
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const {
    path: imagePath = '/images/photo.jpg',
    prefix = 'my-project',
    d = '400x300',
    quality = 80,
    acceptHeader = 'image/webp,image/*',
    userAgentSupportsWebp = true,
  } = req.body || {};

  const queryParams = { prefix, d, quality: String(quality) };
  const rewrite = rewriteViewerRequest(imagePath, queryParams, {
    acceptHeader,
    userAgentSupportsWebp,
  });

  const s3Prefix = prefix || 'my-project';
  const originalKey = `${s3Prefix}${imagePath}`;
  const variantKey = `${s3Prefix}${rewrite.fwdUri}`;

  const steps = [
    {
      title: '1. Viewer request (Lambda@Edge)',
      description: 'CloudFront invokes viewer-request before origin fetch.',
      detail: rewrite.unchanged
        ? `No rewrite: ${imagePath}`
        : `${imagePath} → ${rewrite.fwdUri}`,
      meta: rewrite.header
        ? `Sets header ${rewrite.header.key}: ${rewrite.header.value}`
        : rewrite.note || '',
    },
    {
      title: '2. CloudFront → S3',
      description: 'CDN requests the variant object key.',
      detail: `GET s3://$S3_BUCKET/${variantKey}`,
    },
    {
      title: '3. Origin response on 404',
      description: 'Missing variant triggers origin-response Lambda (Sharp + cache).',
      detail: JSON.stringify(originOn404(originalKey, variantKey, quality)),
    },
    {
      title: '4. Response to browser',
      description: 'Generated image returned; later hits use cached variant.',
      detail: `HTTP 200 — Content-Type from extension (${rewrite.fwdUri.split('.').pop()})`,
    },
  ];

  return res.status(200).json({
    mode: 'simulation',
    awsRequired: [
      'S3_BUCKET',
      'CloudFront viewer-request + origin-response triggers',
      'IAM s3:GetObject / PutObject',
    ],
    input: { path: imagePath, prefix, d, quality, acceptHeader, userAgentSupportsWebp },
    rewrittenUri: rewrite.fwdUri,
    originalResourceType: rewrite.originalResourceType,
    steps,
  });
};
