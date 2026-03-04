import { http, Request } from "@google-cloud/functions-framework";
import { PubSub } from "@google-cloud/pubsub";
import { config } from "./config";
import { getLicense } from "./licenses";
import { isSignatureValid } from "./signature";
import { ErrorResponse, validateRequest } from "./validation";
import { pino } from "pino";
import { createGcpLoggingPinoConfig } from "@google-cloud/pino-logging-gcp-config";

const signatureValidationOrMissingLicenseError: ErrorResponse = {
  errors: ["Invalid signature"],
};

const pubSub = new PubSub({ projectId: config.projectId });
const topic = pubSub.topic(config.topicName, {
  batching: { maxMessages: 10, maxMilliseconds: 10 },
});

const logger = pino(createGcpLoggingPinoConfig());

// Attach request trace ID so that errors and logs can be correlated in GCP Logging and Error Reporting
const getTraceLogStructureFromHeader = (req: Request) => {
  const traceHeader = req.header("X-Cloud-Trace-Context");
  if (traceHeader) {
    const [trace] = traceHeader.split("/");
    return {
      "logging.googleapis.com/trace": `projects/${config.projectId}/traces/${trace}`,
    };
  }
  return {};
};

http("Ingestor", async (req, res) => {
  const validatedRequestResult = validateRequest(req);

  const loggerWithRequestTrace = logger.child(
    getTraceLogStructureFromHeader(req),
  );

  if (!validatedRequestResult.success) {
    return res
      .status(validatedRequestResult.status)
      .json(validatedRequestResult.error);
  }

  const validatedRequest = validatedRequestResult.data;

  const { "x-signature": signature, "x-license-id": licenseId } =
    validatedRequest.headers;

  const license = await getLicense(licenseId);

  // Important to use raw body rather then parsing and stringifying body.
  // Stringifying JSON does not produce a well defined output
  const bodyForSignature = req.rawBody!;
  const body = validatedRequest.body;

  // Prevent timing attacks by checking the signature even if we have not got a license for the ID
  if (
    !isSignatureValid(
      bodyForSignature,
      signature,
      license || Buffer.from("WILL NOT MATCH VALUE"),
      loggerWithRequestTrace,
    )
  ) {
    return res.status(401).send(signatureValidationOrMissingLicenseError);
  }

  try {
    const ingestionTimestamp = new Date().toISOString();
    await Promise.all(
      body.map((message) =>
        topic.publishMessage({
          json: message,
          attributes: { ingestionTimestamp },
        }),
      ),
    );

    res.status(201).send();
  } catch (err) {
    loggerWithRequestTrace.error(err, "Failed to publish messages to Pub/Sub");

    const error: ErrorResponse = {
      errors: ["Failed to process messages"],
    };
    res.status(500).send(error);
  }
});
