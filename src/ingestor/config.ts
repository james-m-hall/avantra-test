import { z } from "zod";

const ConfigSchema = z.object({
  projectId: z.string().min(1),
  topicName: z.string().min(1),
});

// Will throw if any required config is missing or invalid
export const config = ConfigSchema.parse({
  projectId: process.env.GCP_PROJECT_ID,
  topicName: process.env.PUBSUB_TOPIC_NAME,
});
