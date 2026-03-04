import { validateRequest } from "./validation";
import { Request } from "@google-cloud/functions-framework";

describe("validation", () => {
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
  });

  describe("body validation", () => {
    const validHeaders = {
      "x-signature":
        "35926ea99afa0cfef54d332f23d55572df9ac657a0e2fdd8dbeb4ebe01fa126e",
      "x-license-id": "validlicenseid",
      "content-type": "application/json",
    };

    const validUUID = "692caaf7-62d2-45fb-ab68-4739362fadfa";
    const validTimestamp = new Date().toISOString();
    const validVersion = "1.0";

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
            id: "not-a-uuid", // Invalid UUID
            version: validVersion,
            timestamp: validTimestamp,
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
            id: validUUID,
            version: validVersion,
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
            id: validUUID,
            version: { key: "value" },
            timestamp: validTimestamp,
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
          id: validUUID,
          version: validVersion,
          timestamp: validTimestamp,
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
            id: validUUID,
            version: validVersion,
            timestamp: validTimestamp,
            ...extraProperties,
          },
        ],
      } as unknown as Request;

      const result = validateRequest(req);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.body[0]).toEqual(
          expect.objectContaining({
            id: validUUID,
            version: validVersion,
            timestamp: validTimestamp,
            ...extraProperties,
          }),
        );
      }
    });
  });
});
