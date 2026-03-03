# Avantra Telemetry Ingestion Service Task

## Architecture

The proposed architecture is as shown in the diagram below

![image](./Telemetry%20ingestion%20service.drawio.png)

The flow of data from collection to storage can be summarised as follows:

1. Event is collected by the collector in the on premises network.
2. It is persisted locally.
3. The collector sends the data to a global external Application Load Balancer.
   1. If a success response is received it deletes or otherwise marks as processed the event in the local storage.
   2. If a failure response is received it retries sending the event.
4. The global external Application Load Balancer handles the request using the ingestor Cloud Function. This function validates the authentication and then publishes the event to a Pub/Sub topic.
5. The Pub/Sub topic triggers the persister Cloud Function via Eventarc. This function persists the event data to BigQuery as a `JSON` column while also pulling out key columns for improved query performance and ease of use.
6. Events are persisted in BigQuery.

### Single vs Multi-Tenancy

This architecture can support either single or multi-tenancy. In a multi-tenancy scenario each customer would have their own dedicated infrastructure in a dedicated GCP project. For single tenancy customers would share ingestion infrastructure but can have their own dataset in BigQuery.

Requirements for data residency can be accommodated in either a single or multi-tenancy solution. In single tenancy configurations each customer can choose which regions they wish their infrastructure to be deployed to (subject to constraints on GCP feature or quota availability) while for multi-tenancy we can supply regional ingest URLs.

Pros and cons of single tenancy are:

Pros

- Improved security due to project level isolation
- Greater ease of meeting customer compliance requirements
- Reduced blast radius in the event of outages
- Customer isolation removes noisy neighbor risks
- Easier cost allocation

Cons

- Harder to manage - CI/CD/IaC automation must be comprehensive
- Increased costs from duplication of infrastructure
- More discipline required to roll out code changes
- More complex to monitor
- Risk that certain tenants my not get enough traffic trigger rollbacks under a canary deployment

### On Premises Collector

The on premises collector will send events to the cloud based ingestion service via HTTPS.

To guard against data loss it should maintain a local buffer of events (e.g. using SQLite), events should be recorded in the local buffer before being sent to the ingestor. If the collector receives a success response from the ingestion service it can consider the event persisted and remove it from the local buffer. If it receives a failure response it should implement an exponential backoff and retry strategy (with jitter).

The collector should, where possible, batch messages before sending them to the ingestion service.

The collector is also responsible for generating a unique UUID for each event. This allows the rest of the system to deal with duplicates.

### Global External Application Load Balancer

The global external Application Load Balancer in the basic form of this architecture exists primarily to allow for a custom domain. This gives greater future flexibility to change implementation details without needing to update clients. It also provides the possibility to extend the robustness of the system by distributing requests across regions providing protection from regional GCP failure.

### Ingestor Cloud Function

The ingestor cloud function is designed to be simple to reduce the surface area for problems, provide maximum throughput of events and lowest latency. It validates the license hash provided with the request against the value calculated on the backend side and if it is successful publishes a message onto the Pub/Sub topic.

An ingestion timestamp should be added as a message attribute.

#### Authentication and Authorization

HMAC-SHA256 shall be used to authenticate and authorize messages from the collector.

The client shall calculate a signature for each message as `HMAC-SHA256(license + message)` and send the resulting signature in the `X-Signature` header of the request.

The ingestion service will calculate the same signature and check the provided signature matches the server side calculation. If a match is not found the incoming message will be rejected.

It is assumed that a license rotation process exists and that the License ID refers to a specific license secret which is immutable. If rotation occurs a new license secret will be created with a new License ID and these values will be passed to the collector. Once collectors are updated the previous license should be removed.

### Pub/Sub Topic

The Pub/Sub topic decouples data ingest from persistence. This helps prevent data loss in the event of the persistence layer having a temporary outage but also allows the requirements, and implementation, of data persistence to be separated from those of ingestion. I.e. persistence can be scaled differently to ingestion or additional subscribers can be added for different processing use cases.

The topic should be configured to have the maximum message retention period possible (31 days).

No schema should be used due to the potential for changing ingest JSON format.

If data residency is a concern, the message storage policy should be set.

A dead letter topic should be created for events that cannot be delivered so they can be examined and potentially manually retried.

### Persistor

The persistor cloud function's main job is to save data into BigQuery.

Events will largely be saved as is into a `JSON` data type column but for ease of querying certain values, see below, will be pulled out as separate columns.

The cloud function will be responsible for looking up the customer ID from the license ID

### BigQuery

Each customer will have their data contained in a dataset identified by their customer ID. The storage table itself will have the following schema:

| Column name         | Data type   | Nullable |
| ------------------- | ----------- | -------- |
| event_id            | `STRING`    | false    |
| event_timestamp     | `TIMESTAMP` | false    |
| ingestion_timestamp | `TIMESTAMP` | false    |
| event_version       | `STRING`    | false    |
| event               | `JSON`      | false    |

This will allow for a schema-on-read approach to be taken to the event data itself while still improving overall query performance.

The table will be time-unit partitioned on the `event_timestamp` column with daily granularity.

There are a number of scenarios where duplicate events could be persisted to storage. Rather than try and tackle these upstream and introduce additional architectural complexity to the solution we will accept that this will occur and tackle it at query time.

A customer managed encryption key should be used to encrypt the storage table. This will allow us to provide strong guarantees to customers that their data has been removed by deleting the encryption key.

### Lifecycle

Developer workflow should revolve around a single `main` branch that is considered ready to deploy to production at any moment. Developers should work on short lived feature branches that can be quickly reviewed and merged back to `main`. Feature flags should be utilised to allow for incomplete features to added to the codebase without exposing them to customers.

Developers should create PRs for review.

A CI pipeline should run when a PR is opened (and on every commit that is added to a PR). This pipeline should run the following steps (in parallel where possible):

1. Code quality checks (linting, static analysis)
2. Automated tests (unit tests, lightweight integration tests)
3. Security scans (dependency checks etc)
4. Artifact build
5. Preview deployment

A PR cannot be merged to `main` without these steps passing (certain users may have rights to override this in emergencies).

Once a PR is merged to `main` the following pipeline steps take place:

1. Preview deployment is torn down automatically.
2. Immutable artifacts are built and pushed to an artifact repository. These artifacts are used for all subsequent deployments across all environments
3. Artifacts from 1.) are deployed to staging automatically. This should be to both a multi tenant set up and one single tenant to provide a representative production-like environment
4. Full automated integration tests are run
5. Manual QA (if it is required)

There should be a manual approval step before deployment to production that can only be triggered if the previous stages pass. Again the same immutable artifacts are deployed.

#### Rollout

Rollout to production should follow a canary deployment pattern where the new Cloud Function code is deployed as a new revision with initially 0% traffic. This is gradually increased while smoke testing is performed and key metrics are observed. If no issues are detected the traffic is eventually fully switched over to the new revision.

With single tenant deployments, these can also be staged in tiers such that we roll out to customers gradually.

Note that adding a new single tenant customer should not require developer intervention. Instead tooling should be built to automatically provision a new GCP project and update, for example, a terraform variables file with the new customer's details.

#### Rollback

Rollback of application code can be done by switching traffic to a previous Cloud Function revision.

For infrastructure faults this may require reverting changes in source control and re-running the pipeline, this is likely to be slower. Often the best strategy will not be to rollback but rather fix forward.

### Observability and Operations

Key parameters when monitoring service health include:

1. DLT contents - any messages should be considered worthy of an alert
2. How long messages spend on the topic
3. Run time of both cloud functions per request/event
4. Number of Pub/Sub retries
5. Requests per second
6. Error rates

There should be alert thresholds set up for these metrics and when the threshold is breached an alert should be triggered in one or more platforms e.g slack, email.

To help diagnose issues, appropriate logs should be output to Cloud Logging and traces collected to Cloud Trace. To track traces across Pub/Sub the trace ID can be passed in message attributes and should also be included in logs. When an exception occurs the stacktrace should be output to Cloud Logging, if the source is minified then sourcemaps may be needed to output a useful stacktrace.

## Assumptions

1. JSON schema while dynamic has certain common properties, namely:
   1. schema version
   2. event timestamp
   3. event ID
2. Size and velocity of data will not breach an quotas or have an individual message larger than the maximum allowed size
3. Most queries will involve a timestamp range therefore data should be partitioned based on timestamp.
4. The event JSON will not be so complex that query performance will be unacceptable when using the `JSON` column type.
5. Some customers will require single tenancy (for which we can charge a premium) but others will be happy with multi tenancy.
6. Replay attacks are not a concern, the system is designed with the expectation that duplicate events may be stored on occasion.
7. A customer may have more than one `License ID` (for example to allow for license rotation).
8. There exists services from which the ingest service can look up a license secret by license ID or customer ID by license ID.

## Questions

1. How variable is the JSON format?
2. What's the expected volume of data? Both overall and for smallest and largest customers.
3. What's the expected query pattern? This may affect how the table is structured
4. How many customers/licenses do we have and where are the licenses stored? Answer to these questions will affect if and how we cache license hashes.
5. How large (bytes) is each license. This will affect in memory cache size
6. Are single tenants actually required?
7. How much traffic does each customer get, is this enough to make a canary deployment in a single tenant useful?
8. Are we concerned about license IDs being guessed or is it better to provide clearer error messages
