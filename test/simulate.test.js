'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const WEBP = 'webp';

function rewriteViewerRequest(requestUri, queryParams, { acceptHeader, userAgentSupportsWebp }) {
  const params = queryParams || {};
  let fwdUri = requestUri;
  if (userAgentSupportsWebp) {
    fwdUri = fwdUri.replace('.' + path.extname(requestUri), '.' + WEBP);
  }
  const storagePrefix = params.prefix || params.project;
  if (!storagePrefix) return { fwdUri, unchanged: true };
  const match = fwdUri.match(/(images)\/(.*)(.*)\.(.*)/);
  if (!match) return { fwdUri, unchanged: true };
  const prefix = match[1];
  const pathSegment = match[2] !== '' ? match[2].substring(1) : null;
  const imageName = match[3];
  let extension = match[4];
  const accept = acceptHeader || '';
  const urlParts = [prefix];
  if (pathSegment) urlParts.push(pathSegment);
  if (params.d) urlParts.push('resized');
  if (accept.includes(WEBP)) {
    extension = WEBP;
    urlParts.push(WEBP);
  } else if (params.quality) urlParts.push(extension);
  if (params.d) {
    const [w, h] = params.d.split('x');
    urlParts.push(imageName + '-' + w + 'x' + h + '.' + extension);
  } else {
    urlParts.push(imageName + '.' + extension);
  }
  return { fwdUri: '/' + urlParts.join('/'), unchanged: false };
}

test('rewrites images path with resize and webp accept', () => {
  const r = rewriteViewerRequest(
    '/images/photo.jpg',
    { prefix: 'proj', d: '400x300', quality: '80' },
    { acceptHeader: 'image/webp', userAgentSupportsWebp: true },
  );
  assert.equal(r.unchanged, false);
  assert.match(r.fwdUri, /resized/);
  assert.match(r.fwdUri, /400x300/);
  assert.match(r.fwdUri, /\.webp$/);
});

test('passes through without prefix', () => {
  const r = rewriteViewerRequest('/images/photo.jpg', {}, { acceptHeader: '', userAgentSupportsWebp: false });
  assert.equal(r.unchanged, true);
});
