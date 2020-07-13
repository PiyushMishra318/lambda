const querystring = require("querystring");
const path = require("path");
const userAgent = require("useragent");

const variables = {
  webpExtension: "webp",
};

exports.handler = (event, context, callback) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;

  const userAgentString =
    headers["user-agent"] && headers["user-agent"][0]
      ? headers["user-agent"][0].value
      : null;
  const agent = userAgent.lookup(userAgentString);

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

  const supportingBrowser = browsersToInclude.find(
    (browser) =>
      browser.browser === agent.family && agent.major >= browser.version
  );

  // parse the querystrings key-value pairs. In our case it would be d=100x100
  const params = querystring.parse(request.querystring);

  // fetch the uri of original image
  let fwdUri = request.uri;
  if (supportingBrowser)
    fwdUri = fwdUri.replace(`.${path.extname(request.uri)}`, ".webp");

  // if there is no dimension attribute, just pass the request
  if (!params.project) {
    callback(null, request);
    return;
  }

  // parse the prefix, image name and extension from the uri.
  // In our case /images/image.jpg

  const match = fwdUri.match(/(images)\/(.*)(.*)\.(.*)/);

  let prefix = match[1]; // "images"
  let path = match[2] != "" ? match[2].substring(1) : null; // "folder/folder"
  let imageName = match[3]; // "imagename"
  let extension = match[4]; // "jpg"

  // read the accept header to determine if webP is supported.
  let accept = headers["accept"] ? headers["accept"][0].value : "";

  let url = [];
  // build the new uri to be forwarded upstream
  url.push(prefix);
  path ? url.push(path) : null;
  // check if dimension parameter is sent
  if (params.d) {
    url.push("resized");
  }

  // check support for webp
  if (accept.includes(variables.webpExtension)) {
    extension = variables.webpExtension;
    url.push(variables.webpExtension);
  } else {
    if (params.quality) url.push(extension);
  }

  // check if dimension parameter is sent
  if (params.d) {
    // read the dimension parameter value = width x height and split it by 'x'
    const dimensionMatch = params.d.split("x");

    // set the width and height parameters
    let width = dimensionMatch[0];
    let height = dimensionMatch[1];
    url.push(imageName + "-" + width + "x" + height + "." + extension);
  } else url.push(imageName + "." + extension);

  fwdUri = url.join("/");

  const fileFormat = path.extname(request.uri).replace(".", "");
  request.headers["original-resource-type"] = [
    {
      key: "Original-Resource-Type",
      value: `image/${fileFormat}`,
    },
  ];

  console.log(fwdUri);

  // final modified url is of format /images/200x200/webp/image.jpg
  request.uri = fwdUri;
  callback(null, request);
};
