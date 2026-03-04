import supertest from "supertest";
// @ts-ignore
import { getTestServer } from "@google-cloud/functions-framework/testing";
import { getLicense } from "./licenses";
import { createHmac } from "node:crypto";
import { PubSub } from "@google-cloud/pubsub/build/src/pubsub";
import { config } from "./config";
import { Message } from "@google-cloud/pubsub";

describe("Ingestor 'integration' tests", () => {
  const pubSub = new PubSub({ projectId: config.projectId });

  beforeAll(async () => {
    await import("./index");

    await pubSub.createTopic(config.topicName);
  });

  afterAll(async () => {
    const topic = pubSub.topic(config.topicName);
    await topic.delete();
  });

  it("should publish a message to Pub/Sub when receiving a valid request", async () => {
    const server = await getTestServer("Ingestor");

    const testLicenseId = "922ef4eb-57c0-488e-ab05-3f6f1daca5a6";

    const testBodyData = [
      {
        id: "d4a32326-f959-4d1e-96f8-d55178e9a6bb",
        version: "1.0",
        timestamp: new Date().toISOString(),
      },
    ];
    const testBody = JSON.stringify(testBodyData);

    const hmac = createHmac("sha256", (await getLicense(testLicenseId))!);

    hmac.update(testBody);

    const signature = hmac.digest("hex");

    const newSubscriptionName = `test-sub-${Date.now()}`;
    const [subscription] = await pubSub
      .topic(config.topicName)
      .createSubscription(newSubscriptionName);

    const subscriptionMessagePromise = new Promise<Message>(
      (resolve, reject) => {
        subscription.on("message", (message) => {
          resolve(message);
        });

        subscription.on("error", (error) => {
          reject(error);
        });
      },
    );

    await supertest(server)
      .post("/")
      .set("Content-Type", "application/json")
      .set("X-License-ID", testLicenseId)
      .set("X-Signature", signature)
      .send(testBody)
      .expect(201);

    const message = await subscriptionMessagePromise;
    expect(JSON.parse(message.data.toString())).toEqual(testBodyData[0]);
  });
});
