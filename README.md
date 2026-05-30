# AWS Lambda@Edge — Image Pipeline

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A small portfolio of **Lambda@Edge** functions I built during an internship. Together they power on-the-fly image delivery: rewrite requests for WebP/resized variants at the edge, and generate missing variants from S3 when the CDN returns a 404.

This repo is reference code — deploy it with your own S3 bucket, CloudFront distribution, and environment variables.

## Functions

### `viewerrequestlambda/`

**CloudFront viewer-request trigger**

- Parses query parameters (`d`, `quality`, `prefix` or legacy `project`)
- Rewrites image URIs for resized/WebP paths based on browser support
- Sets `Original-Resource-Type` so the origin-response handler knows the source format

### `originresponselambda/`

**CloudFront origin-response trigger**

- Runs when CloudFront gets a **404** for an image
- Loads the original from S3, resizes/converts with **Sharp**, caches the result back to S3
- Returns the generated image in the CloudFront response

## Query parameters

| Param | Example | Purpose |
|-------|---------|---------|
| `prefix` | `assets/site-a` | S3 key prefix for stored images (legacy alias: `project`) |
| `d` | `400x300` | Target width × height |
| `quality` | `80` | Output quality when converting format |

Example request path:

```text
/images/photo.jpg?prefix=assets/site-a&d=400x300&quality=80
```

## Environment

Set on the origin-response function:

```env
S3_BUCKET=your-bucket-name
```

## Project layout

```text
.
├── viewerrequestlambda/   # URI rewriting at the edge
└── originresponselambda/  # Resize + cache on 404
```

## Demo

- **Live:** https://lambda-edge-pipeline.vercel.app
- Set image URI, prefix, dimensions, Accept header, and WebP UA support → **Simulate flow** (matches viewer-request rewrite rules)

Deploy:

```bash
npx vercel --prod
```

Open `/` for the interactive pipeline walkthrough. Production image delivery still uses the Lambda@Edge functions below.

## Deploy notes

1. Package each function with its `node_modules` (Lambda@Edge requires bundled dependencies).
2. Attach **viewer-request** and **origin-response** triggers to your CloudFront distribution.
3. Ensure the Lambda execution role can `s3:GetObject` and `s3:PutObject` on your bucket.

## License

MIT © 2026 [Piyush Mishra](https://github.com/PiyushMishra318)
