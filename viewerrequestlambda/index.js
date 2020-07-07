const userAgent = require("useragent");
const path = require("path");
const querystring = require("querystring");

const variables = {
  allowedDimension: [
    { w: 100, h: 100 },
    { w: 200, h: 200 },
    { w: 300, h: 300 },
    { w: 400, h: 400 },
  ],
  defaultDimension: { w: 200, h: 200 },
  variance: 20,
  webpExtension: "webp",
};

const browsersToInclude = [
  { browser: "Chrome", version: 23 },
  { browser: "Opera", version: 15 },
  { browser: "Android", version: 53 },
  { browser: "Chrome Mobile", version: 55 },
  { browser: "Opera Mobile", version: 37 },
  { browser: "UC Browser", version: 11 },
  { browser: "Samsung Internet", version: 4 },
  { browser: "Safari", version: 14 },
];

exports.handler = async (event, context, callback) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;
  // parse the querystrings key-value pairs. In our case it would be d=100x100
  const params = querystring.parse(request.querystring);

  // if there is no dimension attribute, just pass the request
  if (!params.project) {
    callback(null, request);
    return;
  } else {
    const userAgentString =
      headers["user-agent"] && headers["user-agent"][0]
        ? headers["user-agent"][0].value
        : null;
    const agent = userAgent.lookup(userAgentString);

    const supportingBrowser = browsersToInclude.find(
      (browser) =>
        browser.browser === agent.family && agent.major >= browser.version
    );
    if (!params.d) {
      if (supportingBrowser) {
        const fileFormat = path.extname(request.uri).replace(".", "");
        request.headers["original-resource-type"] = [
          {
            key: "Original-Resource-Type",
            value: `image/${fileFormat}`,
          },
        ];
        const match = fwdUri.match(/(.*)\/(.*)\.(.*)/);
        let prefix = match[1];

        let imageName = match[2];
        let url = [];

        url.push(prefix);
        url.push(variables.webpExtension);
        url.push(imageName + "." + variables.webpExtension);
        fwdUri = url.join("/");
        request.uri = fwdUri;
      }
    } else {
      // fetch the uri of original image
      let fwdUri = request.uri;

      // read the dimension parameter value = width x height and split it by 'x'
      const dimensionMatch = params.d.split("x");

      // set the width and height parameters
      let width = dimensionMatch[0];

      let height = dimensionMatch[1];

      // parse the prefix, image name and extension from the uri.
      // In our case /images/image.jpg

      const match = fwdUri.match(/(.*)\/(.*)\.(.*)/);

      let prefix = match[1];

      let imageName = match[2];

      let extension = match[3];

      // define variable to be set to true if requested dimension is allowed.
      let matchFound = false;

      // calculate the acceptable variance. If image dimension is 105 and is within acceptable
      // range, then in our case, the dimension would be corrected to 100.
      let variancePercent = variables.variance / 100;

      for (let dimension of variables.allowedDimension) {
        let minWidth = dimension.w - dimension.w * variancePercent;

        let maxWidth = dimension.w + dimension.w * variancePercent;

        if (width >= minWidth && width <= maxWidth) {
          width = dimension.w;

          height = dimension.h;

          matchFound = true;

          break;
        }
      }
      // if no match is found from allowed dimension with variance then set to default
      //dimensions.
      if (!matchFound) {
        width = variables.defaultDimension.w;

        height = variables.defaultDimension.h;
      }

      let url = [];

      url.push(prefix);

      url.push(width + "x" + height);

      if (supportingBrowser) {
        const fileFormat = path.extname(request.uri).replace(".", "");
        request.headers["original-resource-type"] = [
          {
            key: "Original-Resource-Type",
            value: `image/${fileFormat}`,
          },
        ];
        url.push(variables.webpExtension);
        url.push(imageName + "." + variables.webpExtension);
      } else {
        url.push(extension);
        url.push(imageName + "." + extension);
      }

      fwdUri = url.join("/");

      request.uri = fwdUri;
    }
  }

  return callback(null, request);
};
