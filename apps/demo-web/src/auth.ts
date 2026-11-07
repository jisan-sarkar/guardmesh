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

export type AuthorizationCodeExchangeConfig = Readonly<{
  issuer: string;
  clientId: string;
  redirectUri: string;
  code: string;
  verifier: string;
  expectedNonce?: string;
  fetchImpl?: typeof fetch;
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

export async function createAuthorizationUrl(config: OidcConfig): Promise<Readonly<{ url: string; verifier: string; state: string; nonce: string }>> {
  const verifier = createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);
  const state = createCodeVerifier();
  const nonce = createCodeVerifier();
  const url = new URL(`${config.issuer}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scope,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    nonce,
  }).toString();
  return { url: url.toString(), verifier, state, nonce };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const encoded = token.split(".")[1];
  if (!encoded) throw new Error("id token is malformed");
  const bytes = Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), (character) => character.charCodeAt(0));
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("id token payload is malformed");
  }
  return parsed as Record<string, unknown>;
}

export async function exchangeAuthorizationCode(
  config: AuthorizationCodeExchangeConfig,
): Promise<TokenSet> {
  const response = await (config.fetchImpl ?? fetch)(
    `${config.issuer}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code: config.code,
        code_verifier: config.verifier,
      }),
    },
  );

  if (!response.ok) throw new Error("authorization code exchange failed");
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { access_token?: unknown }).access_token !== "string" ||
    typeof (body as { expires_in?: unknown }).expires_in !== "number"
  ) {
    throw new Error("token endpoint returned an invalid response");
  }
  if (config.expectedNonce !== undefined) {
    const idToken = (body as { id_token?: unknown }).id_token;
    if (typeof idToken !== "string" || decodeJwtPayload(idToken).nonce !== config.expectedNonce) {
      throw new Error("token endpoint returned an invalid nonce");
    }
  }

  return {
    accessToken: (body as { access_token: string }).access_token,
    expiresAt: Date.now() + (body as { expires_in: number }).expires_in * 1000,
  };
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
