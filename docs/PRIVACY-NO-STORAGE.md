# Privacy: no persistent user-file storage

## Default browser path
Files never leave the user's browser.

## Default Cloudflare backend path
Files are sent only when the user selects a conversion routed to the native backend.

The service:
- does not write user files to R2, KV, D1, Durable Object storage or Analytics Engine;
- uses only a per-request temporary directory on ephemeral Container disk;
- disables public Internet from the conversion Container;
- deletes the temporary directory in a deferred cleanup path;
- streams the output response directly to the browser;
- sets `Cache-Control: no-store, private`;
- logs operational metadata only.

Operational logs may include:
- request ID
- source/target format identifiers
- byte counts
- duration
- success/failure code

Operational logs must not include:
- original filenames if avoidable
- file bytes
- GIS attribute values
- geometry coordinates
- extracted metadata
- user-provided text

## Important wording

The project may say **"no persistent file storage"**.

It must not claim **"the file never touches disk"**, because native GDAL conversions may require temporary seekable files and multi-file sidecars.

## Optional R2 large-file mode

If introduced later, it is a different privacy mode and must require explicit consent. R2 is persistent object storage even if objects are deleted immediately after processing.
