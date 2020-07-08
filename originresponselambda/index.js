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
  console.log("Response status code :%s", response.status);

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
    let params = querystring.parse(request.querystring);

    // if there is no dimension attribute, just pass the response
    if (!params.project) {
      callback(null, response);
      return;
    }

    // read the required path. Ex: uri /images/resized/webp/image-100x100.webp
    let path = request.uri;

    // read the S3 key from the path variable.
    // Ex: path variable /images/resized/webp/image-100x100.webp
    let key = path.substring(1);

    // parse the prefix, width, height and image name
    // Ex: key=images/200x200/webp/image.jpg
    let prefix, originalKey, match, requiredFormat, imageName;

    try {
      match = key.match(/(.*)\/(resized)\/(.*)\/(.*)/);
      prefix = match[1];
      const dimensionMatch = params.d.split("x");
      // set the width and height parameters
      let width = dimensionMatch[0];
      let height = dimensionMatch[1];
      // correction for jpg required for 'Sharp'
      requiredFormat = match[3] == "jpg" ? "jpeg" : match[3];
      imageName = match[4].replace(`-${width}x${height}`, "");
      originalKey =
        params.project +
        "/" +
        prefix +
        "/" +
        imageName.replace(`.${requiredFormat}`, `.${originalFormat}`);
    } catch (err) {
      // no resized folder exist for image..
      console.log("no resized folder present..", err);
      match = key.match(/(.*)\/(.*)\/(.*)/);
      prefix = match[1];
      // correction for jpg required for 'Sharp'
      requiredFormat = match[2] == "jpg" ? "jpeg" : match[2];
      imageName = match[3];
      originalKey =
        params.project +
        "/" +
        prefix +
        "/" +
        imageName.replace(`.${requiredFormat}`, `.${originalFormat}`);
    }

    console.log(originalKey);

    try {
      // get the source image file
      let data = await S3.getObject({
        Bucket: BUCKET,
        Key: originalKey,
      }).promise();

      // perform the resize operation
      let sharpifiedImage = Sharp(data.Body);

      if (params.d) {
        const dimensionMatch = params.d.split("x");
        // set the width and height parameters
        let width = parseInt(dimensionMatch[0]);
        let height = parseInt(dimensionMatch[1]);
        sharpifiedImage = sharpifiedImage.resize(width, height);
      }
      if (params.quality) {
        switch (requiredFormat) {
          case "jpeg":
            sharpifiedImage = sharpifiedImage.jpeg({
              quality: +parseInt(params.quality),
            });
            break;
          case "webp":
            sharpifiedImage = sharpifiedImage.webp({
              quality: +parseInt(params.quality),
            });
            break;
          default:
            sharpifiedImage = sharpifiedImage.toFormat(requiredFormat);
        }
      } else sharpifiedImage = sharpifiedImage.toFormat(requiredFormat);

      let buffer = await sharpifiedImage.toFormat(requiredFormat).toBuffer();
      console.log(key);
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
      console.log(insertResp);
      // generate a binary response with resized image
      response.status = 200;
      response.body = buffer.toString("base64");
      response.bodyEncoding = "base64";
      response.headers["content-type"] = [
        { key: "Content-Type", value: "image/" + requiredFormat },
      ];
      callback(null, response);
    } catch (err) {
      console.log(err);
      callback(null, response);
    }
  } // end of if block checking response statusCode
  else {
    // allow the response to pass through
    callback(null, response);
  }
};
