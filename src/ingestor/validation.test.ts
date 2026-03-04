import { validateRequest } from "./validation";
import { Request } from "@google-cloud/functions-framework";

describe("validation", () => {
  const validHeaders = {
    "x-signature":
      "35926ea99afa0cfef54d332f23d55572df9ac657a0e2fdd8dbeb4ebe01fa126e",
    "x-license-id": "validlicenseid",
    "content-type": "application/json",
  };

  it.each([["GET"], ["PUT"], ["DELETE"], ["PATCH"]])(
    "should return 405 if method is not POST",
    (method) => {
      const req = {
        method,
        headers: {},
        body: null,
      } as unknown as Request;

      const result = validateRequest(req);

      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.status).toBe(405);
      }
    },
  );

  describe("headers validation", () => {
    it("should return error if required headers are missing", () => {
      const req = {
        method: "POST",
        headers: {},
        body: null,
      } as unknown as Request;

      const result = validateRequest(req);

      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.status).toBe(422);
        expect(result.error.properties).toEqual(
          expect.objectContaining({
            headers: {
              errors: [],
              properties: {
                "x-signature": expect.anything(),
                "x-license-id": expect.anything(),
                "content-type": expect.anything(),
              },
            },
          }),
        );
      }
    });

    it("should return error if content-type is not application/json", () => {
      const req = {
        method: "POST",
        headers: {
          ...validHeaders,
          "content-type": "text/plain",
        },
        body: null,
      } as unknown as Request;

      const result = validateRequest(req);

      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.status).toBe(422);
        expect(result.error.properties).toEqual(
          expect.objectContaining({
            headers: {
              errors: [],
              properties: {
                "content-type": {
                  errors: ['Invalid input: expected "application/json"'],
                },
              },
            },
          }),
        );
      }
    });

    it("should return error if x-signature is not a valid sha256 hash", () => {
      const req = {
        method: "POST",
        headers: {
          ...validHeaders,
          "x-signature": "invalid-signature",
        },
        body: null,
      } as unknown as Request;

      const result = validateRequest(req);

      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.status).toBe(422);
        expect(result.error.properties).toEqual(
          expect.objectContaining({
            headers: {
              errors: [],
              properties: {
                "x-signature": {
                  errors: ["Invalid sha256_hex"],
                },
              },
            },
          }),
        );
      }
    });

    it("should return error if x-license-id is not a string", () => {
      const req = {
        method: "POST",
        headers: {
          ...validHeaders,
          "x-license-id": 12345,
        },
        body: null,
      } as unknown as Request;

      const result = validateRequest(req);

      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.status).toBe(422);
        expect(result.error.properties).toEqual(
          expect.objectContaining({
            headers: {
              errors: [],
              properties: {
                "x-license-id": {
                  errors: ["Invalid input: expected string, received number"],
                },
              },
            },
          }),
        );
      }
    });

    it("should pass validation with valid headers", () => {
      const req = {
        method: "POST",
        headers: validHeaders,
        body: [],
      } as unknown as Request;

      const result = validateRequest(req);

      expect(result.success).toBe(true);
    });
  });

  describe("body validation", () => {
    const validBody = {
      id: "692caaf7-62d2-45fb-ab68-4739362fadfa",
      version: "1.0",
      timestamp: new Date().toISOString(),
    };

    it("should return error if body is not an array", () => {
      const req = {
        method: "POST",
        headers: validHeaders,
        body: { invalid: "body" }, // Should be an array
      } as unknown as Request;

      const result = validateRequest(req);

      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.status).toBe(422);
        expect(result.error.properties).toEqual(
          expect.objectContaining({
            body: {
              errors: ["Invalid input: expected array, received object"],
            },
          }),
        );
      }
    });

    it("should return error if id is invalid", () => {
      const req = {
        method: "POST",
        headers: validHeaders,
        body: [
          {
            ...validBody,
            id: "not-a-uuid", // Invalid UUID
          },
        ],
      } as unknown as Request;

      const result = validateRequest(req);

      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.status).toBe(422);
        expect(result.error.properties).toEqual(
          expect.objectContaining({
            body: {
              errors: [],
              items: [
                {
                  errors: [],
                  properties: {
                    id: {
                      errors: ["Invalid UUID"],
                    },
                  },
                },
              ],
            },
          }),
        );
      }
    });

    it("should return error if timestamp is invalid", () => {
      const req = {
        method: "POST",
        headers: validHeaders,
        body: [
          {
            ...validBody,
            timestamp: "invalid-timestamp",
          },
        ],
      } as unknown as Request;

      const result = validateRequest(req);

      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.status).toBe(422);
        expect(result.error.properties).toEqual(
          expect.objectContaining({
            body: {
              errors: [],
              items: [
                {
                  errors: [],
                  properties: {
                    timestamp: {
                      errors: ["Invalid ISO datetime"],
                    },
                  },
                },
              ],
            },
          }),
        );
      }
    });

    it("should return error if version is invalid", () => {
      const req = {
        method: "POST",
        headers: validHeaders,
        body: [
          {
            ...validBody,
            version: { key: "value" },
          },
        ],
      } as unknown as Request;

      const result = validateRequest(req);

      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.status).toBe(422);
        expect(result.error.properties).toEqual(
          expect.objectContaining({
            body: {
              errors: [],
              items: [
                {
                  errors: [],
                  properties: {
                    version: {
                      errors: [
                        "Invalid input: expected string, received object",
                      ],
                    },
                  },
                },
              ],
            },
          }),
        );
      }
    });

    it.each([["id"], ["version"], ["timestamp"]])(
      "should return error for missing body property",
      (missingProperty) => {
        const body = {
          ...validBody,
        };

        delete body[missingProperty as keyof typeof body];

        const req = {
          method: "POST",
          headers: validHeaders,
          body: [body],
        } as unknown as Request;

        const result = validateRequest(req);

        expect(result.success).toBe(false);
        if (result.success === false) {
          expect(result.status).toBe(422);
          expect(result.error.properties).toEqual(
            expect.objectContaining({
              body: {
                errors: [],
                items: [
                  {
                    errors: [],
                    properties: {
                      [missingProperty]: {
                        errors: [
                          "Invalid input: expected string, received undefined",
                        ],
                      },
                    },
                  },
                ],
              },
            }),
          );
        }
      },
    );

    it("should allow additional properties in body items", () => {
      const extraProperties = {
        extra: 42,
        anotherExtra: "extra",
      };

      const req = {
        method: "POST",
        headers: validHeaders,
        body: [
          {
            ...validBody,
            ...extraProperties,
          },
        ],
      } as unknown as Request;

      const result = validateRequest(req);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.body[0]).toEqual(
          expect.objectContaining({
            ...validBody,
            ...extraProperties,
          }),
        );
      }
    });
  });
});
