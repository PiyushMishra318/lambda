const querystring = require('querystring');
const AWS = require('aws-sdk');
const Sharp = require('sharp');

const S3 = new AWS.S3({ signatureVersion: 'v4' });
const BUCKET = process.env.S3_BUCKET || 'your-bucket-name';

function getStoragePrefix(params) {
  return params.prefix || params.project;
}

exports.handler = async (event, context, callback) => {
  const response = event.Records[0].cf.response;

  if (response.status !== '404') {
    callback(null, response);
    return;
  }

  const request = event.Records[0].cf.request;
  const originalFormat =
    request.headers['original-resource-type'] &&
    request.headers['original-resource-type'][0]
      ? request.headers['original-resource-type'][0].value.replace(
          'image/',
          '',
        )
      : null;

  const params = querystring.parse(request.querystring);
  const storagePrefix = getStoragePrefix(params);

  if (!storagePrefix) {
    callback(null, response);
    return;
  }

  const uriPath = request.uri;
  const key = uriPath.substring(1);

  let prefix;
  let pathSegment;
  let requiredFormat;
  let imageName;
  let originalKey;

  try {
    const match = key.match(/(images)(.*)\/(resized)\/(.*)\/(.*)/);
    prefix = match[1];
    pathSegment = match[2];
    const dimensionMatch = params.d.split('x');
    const width = dimensionMatch[0];
    const height = dimensionMatch[1];
    requiredFormat = match[4] === 'jpg' ? 'jpeg' : match[4];
    imageName = match[5].replace(`-${width}x${height}`, '');
    originalKey = `${storagePrefix}/${prefix}${pathSegment}/${imageName.replace(
      `.${requiredFormat}`,
      `.${originalFormat}`,
    )}`;
  } catch (err) {
    const match = key.match(/(images)(.*)\/(.*)\/(.*)/);
    prefix = match[1];
    pathSegment = match[2];
    requiredFormat = match[3] === 'jpg' ? 'jpeg' : match[3];
    imageName = match[4];
    originalKey = `${storagePrefix}/${prefix}${pathSegment}/${imageName.replace(
      `.${requiredFormat}`,
      `.${originalFormat}`,
    )}`;
  }

  try {
    const data = await S3.getObject({
      Bucket: BUCKET,
      Key: originalKey,
    }).promise();

    let sharpifiedImage = Sharp(data.Body);

    if (params.d) {
      const dimensionMatch = params.d.split('x');
      const width = parseInt(dimensionMatch[0], 10);
      const height = parseInt(dimensionMatch[1], 10);
      sharpifiedImage = sharpifiedImage.resize(width, height);
    }

    if (params.quality) {
      sharpifiedImage = sharpifiedImage.toFormat(requiredFormat, {
        quality: parseInt(params.quality, 10),
      });
    } else {
      sharpifiedImage = sharpifiedImage.toFormat(requiredFormat);
    }

    const buffer = await sharpifiedImage.toBuffer();

    await S3.putObject({
      Body: buffer,
      Bucket: BUCKET,
      ContentType: `image/${requiredFormat}`,
      CacheControl: 'max-age=31536000',
      Key: `${storagePrefix}/${key}`,
      ACL: 'public-read',
      ContentLength: buffer.length,
      Expires: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    }).promise();

    response.status = '200';
    response.body = buffer.toString('base64');
    response.bodyEncoding = 'base64';
    response.headers['content-type'] = [
      { key: 'Content-Type', value: `image/${requiredFormat}` },
    ];
    response.headers['cache-control'] = [
      { key: 'Cache-Control', value: 'max-age=31536000' },
    ];
    response.headers.expires = [
      {
        key: 'Expires',
        value: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toUTCString(),
      },
    ];
    callback(null, response);
  } catch (err) {
    callback(null, response);
  }
};
