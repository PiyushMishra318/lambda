const querystring = require("querystring");

const AWS = require("aws-sdk");
const S3 = new AWS.S3({
  signatureVersion: "v4",
});
const Sharp = require("sharp");

// set the S3 and API GW endpoints
const BUCKET = "html-cms";

exports.handler = async (event, context, callback) => {
  let response = event.Records[0].cf.response;
  // console.log("Response status code :%s", response.status);

  //check if image is not present
  if (response.status == 404) {
    let request = event.Records[0].cf.request;
    const originalFormat =
      request.headers["original-resource-type"] &&
      request.headers["original-resource-type"][0]
        ? request.headers["original-resource-type"][0].value.replace(
            "image/",
            ""
          )
        : null;
    // console.log("originalFormat", originalFormat);
    let params = querystring.parse(request.querystring);
    // console.log("params", params);
    // if there is no dimension attribute, just pass the response
    if (!params.project) {
      callback(null, response);
      return;
    }

    // read the required path. Ex: uri /images/resized/webp/image-100x100.webp
    let path = request.uri;
    // console.log("path", path);
    // read the S3 key from the path variable.
    // Ex: path variable /images/resized/webp/image-100x100.webp
    let key = path.substring(1);
    // console.log("key", key);
    // parse the prefix, width, height and image name
    // Ex: key=images/200x200/webp/image.jpg
    let prefix, originalKey, match, requiredFormat, imageName, path;

    try {
      match = key.match(/(images)(.*)\/(resized)\/(.*)\/(.*)/);
      prefix = match[1];
      path = match[2];
      const dimensionMatch = params.d.split("x");
      // set the width and height parameters
      let width = dimensionMatch[0];
      let height = dimensionMatch[1];
      // correction for jpg required for 'Sharp'
      requiredFormat = match[4] == "jpg" ? "jpeg" : match[4];
      imageName = match[5].replace(`-${width}x${height}`, "");
      originalKey =
        params.project +
        "/" +
        prefix +
        path +
        "/" +
        imageName.replace(`.${requiredFormat}`, `.${originalFormat}`);
      // console.log("requiredFormat", requiredFormat);
    } catch (err) {
      // no resized folder exist for image..
      // console.log("no resized folder present..", err);
      match = key.match(/(images)(.*)\/(.*)\/(.*)/);
      prefix = match[1];
      path = match[2];
      // correction for jpg required for 'Sharp'
      requiredFormat = match[3] == "jpg" ? "jpeg" : match[3];
      imageName = match[4];
      originalKey =
        params.project +
        "/" +
        prefix +
        path +
        "/" +
        imageName.replace(`.${requiredFormat}`, `.${originalFormat}`);
      // console.log("requiredFormat", requiredFormat);
    }

    // console.log(originalKey);

    try {
      // get the source image file
      let data = await S3.getObject({
        Bucket: BUCKET,
        Key: originalKey,
      }).promise();
      // console.log("data", data);
      // perform the resize operation
      let sharpifiedImage = Sharp(data.Body);
      // console.log("sharpifiedImage");
      if (params.d) {
        const dimensionMatch = params.d.split("x");
        // set the width and height parameters
        let width = parseInt(dimensionMatch[0]);
        let height = parseInt(dimensionMatch[1]);
        sharpifiedImage = sharpifiedImage.resize(width, height);
      }
      if (params.quality) {
        sharpifiedImage = sharpifiedImage.toFormat(requiredFormat, {
          quality: parseInt(params.quality),
        });
      } else sharpifiedImage = sharpifiedImage.toFormat(requiredFormat);

      let buffer = await sharpifiedImage.toBuffer();
      // console.log("buffer");
      // console.log(key);
      // save the resized object to S3 bucket with appropriate object key.
      let insertResp = await S3.putObject({
        Body: buffer,
        Bucket: BUCKET,
        ContentType: "image/" + requiredFormat,
        CacheControl: "max-age=31536000",
        Key: params.project + "/" + key,
        ACL: "public-read",
        ContentLength: buffer.length,
        Expires: new Date().setDate(new Date().getDate() + 2),
      }).promise();
      // console.log(insertResp);
      // generate a binary response with resized image
      response.status = 200;
      response.body = buffer.toString("base64");
      response.bodyEncoding = "base64";
      response.headers["content-type"] = [
        { key: "Content-Type", value: "image/" + requiredFormat },
      ];
      response.headers["cache-control"] = [
        {
          key: "Cache-Control",
          value: "max-age=31536000",
        },
      ];
      response.headers["expires"] = [
        { key: "Expires", value: new Date().setDate(new Date().getDate() + 2) },
      ];
      callback(null, response);
    } catch (err) {
      // console.log(JSON.stringify(err));
      callback(null, response);
    }
  } // end of if block checking response statusCode
  else {
    // allow the response to pass through
    callback(null, response);
  }
};
