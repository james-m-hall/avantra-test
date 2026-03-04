import { createHmac, timingSafeEqual } from "node:crypto";
import pino from "pino";

export const isSignatureValid = (
  payload: Buffer,
  signature: string,
  license: Buffer,
  logger?: pino.Logger,
) => {
  const hmac = createHmac("sha256", license);

  hmac.update(payload);

  const computedSignature = hmac.digest("hex");

  // Use timingSafeEqual to prevent against timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(signature),
    );
  } catch (err) {
    logger?.error(err, "Error validating signature");
    return false;
  }
};
