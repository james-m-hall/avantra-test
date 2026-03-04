import z from "zod";
import { Request } from "@google-cloud/functions-framework";

export interface ErrorResponse {
  errors: string[];
}

type ValidationErrorResponse = ErrorResponse &
  ReturnType<typeof z.treeifyError<z.infer<typeof Input>>>;

interface ValidationSuccess {
  success: true;
  data: z.infer<typeof Input>;
}

interface ValidationFailure {
  success: false;
  error: ValidationErrorResponse;
  status: number;
}

type ValidationResult = ValidationSuccess | ValidationFailure;

// Lowercased header names to match req.headers which has lowercased header names
const HeadersInput = z.object({
  "x-signature": z.hash("sha256"),
  // If the LicenseId follows a specific pattern we can make it more specific
  "x-license-id": z.string(),
  "content-type": z.literal("application/json"),
});

// Assume the body is an array of events.
// Although the structure of the JSON payload is subject to change, assume that certain minimum
// fields will always be present.
const BodyInput = z.array(
  z.looseObject({
    id: z.uuid(),
    version: z.string(),
    timestamp: z.iso.datetime(),
  }),
);

const Input = z.object({
  headers: HeadersInput,
  body: BodyInput,
});

export const validateRequest = (req: Request): ValidationResult => {
  if (req.method !== "POST") {
    const error: ErrorResponse = {
      errors: ["Unsupported HTTP method. Only POST is allowed."],
    };

    return { success: false, error, status: 405 };
  }

  const inputParseResult = Input.safeParse({
    headers: req.headers,
    body: req.body,
  });

  if (!inputParseResult.success) {
    const hasContentTypeIssue = inputParseResult.error.issues.some(
      (issue) =>
        issue.path[0] === "headers" && issue.path[1] === "Content-Type",
    );

    let status = 422;
    if (hasContentTypeIssue) {
      status = 415;
    }

    const error: ValidationErrorResponse = z.treeifyError(
      inputParseResult.error,
    );
    return { success: false, error, status };
  }

  return { success: true, data: inputParseResult.data };
};
