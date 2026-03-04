# Ingestor function

The ingestor function here is a spike to demonstrate:

1. How authentication can be done by using HMAC-SHA256 with the license as a shared secret
2. Request validation
3. Logging integration

The function takes a `POST` request with the license ID supplied in the `X-License-ID` header and the signature supplied in the `X-Signature` header. The request body must be JSON and contain at least `id` (UUID), `version` (arbitrary string) and `timestamp` (ISO 8601 datetime) properties. Additional properties are allowed to accommodate the changing structure of the incoming events.

## Signature Generation

To generate a signature for manual testing (to be passed as the `X-Signature` header) see the following example command

```bash
echo -n '[{"id": "a496e6e9-6ca7-48d1-b76a-e680b89c1440", "version": "v1", "timestamp": "2026-03-03T00:00:00Z"}]' | openssl dgst -sha256 -hmac "a secret value"
```

Where the string passed to `echo` must match _exactly_ the one sent via HTTP.

The final secret value (in the example `"a secret value"`) should be that mock value that corresponds to the license ID passed in the `X-License-ID` header

## Local deployment

After authenticating to GCP, run

```bash
npm run dev
```

Ensuring that the environment variables `GCP_PROJECT_ID` (for the project ID) and `PUBSUB_TOPIC_NAME` (for a topic to publish messages to) are defined.

The function will listen on port 8080 and will auto-reload when the typescript files are updated.

## Cloud deployment

To deploy the function to GCP you can run:

```bash
gcloud run deploy ingestor-http-function --source . --function Ingestor --base-image nodejs24 --region europe-west1 --allow-unauthenticated --set-env-vars GCP_PROJECT_ID=avantra-test,PUBSUB_TOPIC_NAME=event-test
```

Swapping the `GCP_PROJECT_ID` for the deployment project ID and `PUBSUB_TOPIC_NAME` for a topic to publish messages to.

## Running tests

First run the pub sub emulator by running `docker compose up -d`

Then to run the tests run `npm run test`
