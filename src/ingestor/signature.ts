import { createHmac, timingSafeEqual } from "node:crypto";

export const isSignatureValid = (
  payload: Buffer,
  signature: string,
  license: Buffer,
) => {
  const hmac = createHmac("sha256", license);

  hmac.update(payload);

  const computedSignature = hmac.digest("hex");

  // Use timingSafeEqual to prevent against timing attacks
  return timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(signature),
  );
};
