import { isSignatureValid } from "./signature";

describe("signature", () => {
  const payload = Buffer.from("test payload");
  const license = Buffer.from("secret license");
  const matchingSignature =
    "35926ea99afa0cfef54d332f23d55572df9ac657a0e2fdd8dbeb4ebe01fa126e";
  const nonMatchingSignature = matchingSignature.replace(/a/g, "b"); // Just change some characters to make it non-matching

  it("should validate the signature correctly", () => {
    expect(isSignatureValid(payload, matchingSignature, license)).toBe(true);
  });

  it("should return false for an invalid signature", () => {
    const invalidSignature = "invalidsignature";

    expect(isSignatureValid(payload, invalidSignature, license)).toBe(false);
  });

  it("should return false for an non matching signature", () => {
    expect(isSignatureValid(payload, nonMatchingSignature, license)).toBe(
      false,
    );
  });
});
