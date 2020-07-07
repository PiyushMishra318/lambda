const path = require("path");
const AWS = require("aws-sdk");
const S3 = new AWS.S3({
  signatureVersion: "v4",
});
const Sharp = require("sharp");
const querystring = require("querystring");
const BUCKET = "html-cms";
exports.handler = async (event, context, callback) => {
  const { request, response } = event.Records[0].cf;
  const { uri } = request;
  const params = querystring.parse(request.querystring);
  const headers = response.headers;

  // if there is no dimension attribute, just pass the response
  if (!params.project) {
    console.log("project param not found");
    callback(null, response);
    return;
  } else {
    if (!params.d) {
      if (path.extname(uri) === ".webp") {
        if (response.status == 404) {
          const format =
            request.headers["original-resource-type"] &&
            request.headers["original-resource-type"][0]
              ? request.headers["original-resource-type"][0].value.replace(
                  "image/",
                  ""
                )
              : null;

          const key = params.project + uri;
          const s3key = key.replace(".webp", `.${format}`).replace("/webp", "");
          try {
            const bucketResource = await S3.getObject({
              Bucket: BUCKET,
              Key: s3key,
            }).promise();
            let sharpImageBuffer = await Sharp(bucketResource.Body);
            if (params.quality)
              sharpImageBuffer = await sharpImageBuffer.webp({
                quality: +parseInt(params.quality),
              });
            else
              sharpImageBuffer = await sharpImageBuffer.webp({
                quality: +75,
              });
            sharpImageBuffer = await sharpImageBuffer.toBuffer();

            await S3.putObject({
              ACL: "public-read",
              ContentType: "image/webp",
              ContentLength: sharpImageBuffer.length,
              CacheControl: "max-age=31536000",
              Body: sharpImageBuffer,
              Bucket: BUCKET,
              Key: key,
              Expires: new Date().setDate(new Date().getDate() + 2),
            }).promise();

            response.status = 200;
            response.body = sharpImageBuffer.toString("base64");
            response.bodyEncoding = "base64";
            response.headers["content-type"] = [
              { key: "Content-Type", value: "image/webp" },
            ];
          } catch (error) {
            console.log(error);
            callback(null, response);
          }
        } else {
          headers["content-type"] = [
            {
              value: "image/webp",
              key: "Content-Type",
            },
          ];
        }
      }
    } else {
      // read the required path. Ex: uri /images/100x100/webp/image.jpg
      let path = request.uri;
      const format =
        request.headers["original-resource-type"] &&
        request.headers["original-resource-type"][0]
          ? request.headers["original-resource-type"][0].value.replace(
              "image/",
              ""
            )
          : null;
      // read the S3 key from the path variable.
      // Ex: path variable /images/100x100/webp/image.jpg
      let key = path.substring(1);

      // parse the prefix, width, height and image name
      // Ex: key=images/200x200/webp/image.jpg
      let prefix, originalKey, match, width, height, requiredFormat, imageName;

      try {
        match = key.match(/(.*)\/(\d+)x(\d+)\/(.*)\/(.*)/);
        prefix = match[1];
        width = parseInt(match[2], 10);
        height = parseInt(match[3], 10);

        // correction for jpg required for 'Sharp'
        requiredFormat = match[4] == "jpg" ? "jpeg" : match[4];
        imageName = match[5];
        originalKey =
          params.project +
          "/" +
          prefix +
          "/" +
          imageName.replace(`.${requiredFormat}`, `.${format}`);
      } catch (err) {
        console.log(err);
        callback(null, response);
      }
      try {
        // get the source image file
        let data = await S3.getObject({
          Bucket: BUCKET,
          Key: originalKey,
        }).promise();
        // perform the resize operation
        let sharpedImage = await Sharp(data.Body).resize(width, height);
        if (path.extname(uri) === ".webp") {
          if (params.quality) {
            sharpedImage = await sharpedImage.webp({
              quality: +parseInt(params.quality),
            });
          } else sharpedImage = await sharpedImage.webp({ quality: +75 });
        } else sharpedImage = await sharpedImage.toFormat(requiredFormat);

        sharpedImage = await sharpedImage.toBuffer();
        // save the resized object to S3 bucket with appropriate object key.
        await S3.putObject({
          Body: sharpedImage,
          Bucket: BUCKET,
          ContentType: "image/" + requiredFormat,
          Key: params.project + "/" + key,
          ACL: "public-read",
          ContentLength: sharpedImage.length,
          CacheControl: "max-age=31536000",
          Expires: new Date().setDate(new Date().getDate() + 2),
        }).promise();
        // even if there is exception in saving the object we send back the generated
        // image back to viewer below

        // generate a binary response with resized image
        response.status = 200;
        response.body = sharpedImage.toString("base64");
        response.bodyEncoding = "base64";
        response.headers["content-type"] = [
          { key: "Content-Type", value: "image/" + requiredFormat },
        ];
        callback(null, response);
      } catch (err) {
        console.log("Exception while reading source image :%j", err);
        callback(null, response);
      }
    }
  }
  callback(null, response);
};
