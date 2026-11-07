export type OidcConfig = Readonly<{
  issuer: string;
  clientId: string;
  redirectUri: string;
  scope: string;
}>;

export type TokenSet = Readonly<{
  accessToken: string;
  expiresAt: number;
}>;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function createCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return base64Url(new Uint8Array(digest));
}

export async function createAuthorizationUrl(config: OidcConfig): Promise<Readonly<{ url: string; verifier: string }>> {
  const verifier = createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);
  const url = new URL(`${config.issuer}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scope,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), verifier };
}

export class MemoryTokenStore {
  private tokenSet: TokenSet | undefined;

  public set(tokenSet: TokenSet): void {
    this.tokenSet = tokenSet;
  }

  public get(): TokenSet | undefined {
    return this.tokenSet;
  }

  public clear(): void {
    this.tokenSet = undefined;
  }
}
