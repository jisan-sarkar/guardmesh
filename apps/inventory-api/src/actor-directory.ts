import type { InventoryActor } from "@guardmesh/inventory-service";

export interface ActorDirectory {
  findBySubject(subject: string): Promise<InventoryActor | undefined>;
}

export class InMemoryActorDirectory implements ActorDirectory {
  public constructor(private readonly actors: ReadonlyMap<string, InventoryActor>) {}

  public async findBySubject(subject: string): Promise<InventoryActor | undefined> {
    return this.actors.get(subject);
  }
}

export function actorDirectoryFromEnvironment(): ActorDirectory {
  const parsed: unknown = JSON.parse(process.env.ACTOR_DIRECTORY_JSON ?? "{}");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("ACTOR_DIRECTORY_JSON must be an object");
  }

  const actors = new Map<string, InventoryActor>();
  for (const [subject, value] of Object.entries(parsed)) {
    if (
      typeof value !== "object" ||
      value === null ||
      !Array.isArray((value as { roles?: unknown }).roles) ||
      typeof (value as { locationId?: unknown }).locationId !== "string"
    ) {
      throw new Error("ACTOR_DIRECTORY_JSON contains an invalid actor");
    }

    actors.set(subject, {
      actorId: subject,
      roles: (value as { roles: string[] }).roles,
      locationId: (value as { locationId: string }).locationId,
    });
  }

  return new InMemoryActorDirectory(actors);
}
