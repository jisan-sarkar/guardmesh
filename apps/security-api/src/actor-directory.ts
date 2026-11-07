export type SecurityActor = Readonly<{ actorId: string; roles: string[] }>;

export class SecurityActorDirectory {
  public constructor(private readonly actors: ReadonlyMap<string, SecurityActor>) {}

  public find(subject: string): SecurityActor | undefined {
    return this.actors.get(subject);
  }
}

export function actorDirectoryFromEnvironment(): SecurityActorDirectory {
  const parsed: unknown = JSON.parse(process.env.ACTOR_DIRECTORY_JSON ?? "{}");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("ACTOR_DIRECTORY_JSON must be an object");
  }
  const actors = new Map<string, SecurityActor>();
  for (const [subject, value] of Object.entries(parsed)) {
    if (
      typeof value !== "object" ||
      value === null ||
      !Array.isArray((value as { roles?: unknown }).roles) ||
      !(value as { roles: unknown[] }).roles.every(
        (role) => typeof role === "string" && role.length > 0,
      )
    ) {
      throw new Error("ACTOR_DIRECTORY_JSON contains an invalid actor");
    }
    actors.set(subject, { actorId: subject, roles: (value as { roles: string[] }).roles });
  }
  return new SecurityActorDirectory(actors);
}
