import { connectWorkflowBroker, consumeWithAck, securityEventsTopology } from "@guardmesh/messaging";
import { SecurityService } from "@guardmesh/security-service";
import { defaultReadiness } from "@guardmesh/observability";

export async function startSecurityWorkflow(security: SecurityService): Promise<void> {
  const brokerUrl = process.env.RABBITMQ_URL;
  if (!brokerUrl) return;

  try {
    const broker = await connectWorkflowBroker(brokerUrl, { topologies: [securityEventsTopology] });
    await consumeWithAck(broker.channel, "security.events", async (message) => {
      await security.ingest(message);
    }, { retryExchange: "", retryRoutingKey: securityEventsTopology.queue, maxAttempts: 3 });
    defaultReadiness.markReady();
  } catch (error) {
    console.error("security workflow is unavailable", error);
    setTimeout(() => void startSecurityWorkflow(security), 2_000).unref();
  }
}
