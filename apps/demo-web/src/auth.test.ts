import { describe, expect, it, vi } from "vitest";

import { createAuthorizationUrl, createCodeChallenge, exchangeAuthorizationCode, MemoryTokenStore } from "./auth";

describe("browser OIDC helpers", () => {
  it("creates a PKCE S256 authorization URL", async () => {
    const result = await createAuthorizationUrl({
      issuer: "https://identity.example.test/realms/guardmesh",
      clientId: "demo-web",
      redirectUri: "http://localhost:5173/callback",
      scope: "openid profile",
    });
    const url = new URL(result.url);

    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(await createCodeChallenge(result.verifier));
  });

  it("keeps tokens in memory only", () => {
    const store = new MemoryTokenStore();
    store.set({ accessToken: "token", expiresAt: 123 });
    expect(store.get()).toEqual({ accessToken: "token", expiresAt: 123 });
    store.clear();
    expect(store.get()).toBeUndefined();
  });

  it("exchanges an authorization code and calculates expiry", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "access-1", expires_in: 300 }), { status: 200 }),
    );

    await expect(exchangeAuthorizationCode({
      issuer: "https://identity.example.test/realms/guardmesh",
      clientId: "demo-web",
      redirectUri: "http://localhost:5173/callback",
      code: "code-1",
      verifier: "verifier-1",
      fetchImpl,
    })).resolves.toMatchObject({ accessToken: "access-1" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
