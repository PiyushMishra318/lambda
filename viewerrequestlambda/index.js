const querystring = require('querystring');
const path = require('path');
const userAgent = require('useragent');

const WEBP_EXTENSION = 'webp';

function getStoragePrefix(params) {
  return params.prefix || params.project;
}

exports.handler = (event, context, callback) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;

  const userAgentString =
    headers['user-agent'] && headers['user-agent'][0]
      ? headers['user-agent'][0].value
      : null;
  const agent = userAgent.lookup(userAgentString);

  const browsersToInclude = [
    { browser: 'Chrome', version: 23 },
    { browser: 'Opera', version: 15 },
    { browser: 'Android', version: 53 },
    { browser: 'Chrome Mobile', version: 55 },
    { browser: 'Opera Mobile', version: 37 },
    { browser: 'UC Browser', version: 11 },
    { browser: 'Samsung Internet', version: 4 },
    { browser: 'Safari', version: 14 },
  ];

  const supportingBrowser = browsersToInclude.find(
    (browser) =>
      browser.browser === agent.family && agent.major >= browser.version,
  );

  const params = querystring.parse(request.querystring);

  let fwdUri = request.uri;
  if (supportingBrowser) {
    fwdUri = fwdUri.replace(
      `.${path.extname(request.uri)}`,
      `.${WEBP_EXTENSION}`,
    );
  }

  if (!getStoragePrefix(params)) {
    callback(null, request);
    return;
  }

  const match = fwdUri.match(/(images)\/(.*)(.*)\.(.*)/);
  if (!match) {
    callback(null, request);
    return;
  }

  const prefix = match[1];
  const pathSegment = match[2] !== '' ? match[2].substring(1) : null;
  const imageName = match[3];
  let extension = match[4];

  const accept = headers.accept ? headers.accept[0].value : '';
  const urlParts = [prefix];

  if (pathSegment) {
    urlParts.push(pathSegment);
  }

  if (params.d) {
    urlParts.push('resized');
  }

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

  fwdUri = urlParts.join('/');

  const fileFormat = path.extname(request.uri).replace('.', '');
  request.headers['original-resource-type'] = [
    {
      key: 'Original-Resource-Type',
      value: `image/${fileFormat}`,
    },
  ];

  request.uri = fwdUri;
  callback(null, request);
};
