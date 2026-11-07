import { connectWorkflowBroker, consumeWithAck } from "@guardmesh/messaging";
import { SecurityService } from "@guardmesh/security-service";

export async function startSecurityWorkflow(security: SecurityService): Promise<void> {
  const brokerUrl = process.env.RABBITMQ_URL;
  if (!brokerUrl) return;

  try {
    const broker = await connectWorkflowBroker(brokerUrl);
    await consumeWithAck(broker.channel, "security.events", async (message) => {
      await security.ingest(message);
    });
  } catch (error) {
    console.error("security workflow is unavailable", error);
    setTimeout(() => void startSecurityWorkflow(security), 2_000).unref();
  }
}
