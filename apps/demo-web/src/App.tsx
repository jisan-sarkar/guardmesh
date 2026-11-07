import { useEffect, useState } from "react";

import { createAuthorizationUrl, exchangeAuthorizationCode, MemoryTokenStore } from "./auth";

const tokenStore = new MemoryTokenStore();
const oidcConfig = {
  issuer: import.meta.env.VITE_OIDC_ISSUER ?? "http://localhost:8080/realms/guardmesh",
  clientId: import.meta.env.VITE_OIDC_CLIENT_ID ?? "demo-web",
  redirectUri: `${window.location.origin}/callback`,
  scope: "openid profile",
};

export function App() {
  const [message, setMessage] = useState("Not authenticated");

  useEffect(() => {
    const callback = new URL(window.location.href);
    const code = callback.searchParams.get("code");
    if (callback.pathname !== "/callback" || !code) return;

    const verifier = sessionStorage.getItem("guardmesh.pkce_verifier");
    if (!verifier) {
      setMessage("Sign-in could not be completed: the PKCE verifier is missing");
      return;
    }

    void exchangeAuthorizationCode({
      issuer: oidcConfig.issuer,
      clientId: oidcConfig.clientId,
      redirectUri: oidcConfig.redirectUri,
      code,
      verifier,
    }).then((tokens) => {
      tokenStore.set(tokens);
      sessionStorage.removeItem("guardmesh.pkce_verifier");
      window.history.replaceState({}, "", "/");
      setMessage("Authenticated; access token is held in memory");
    }).catch(() => setMessage("Sign-in failed; please try again"));
  }, []);

  async function signIn() {
    const { url, verifier } = await createAuthorizationUrl(oidcConfig);
    sessionStorage.setItem("guardmesh.pkce_verifier", verifier);
    window.location.assign(url);
  }

  function signOut() {
    tokenStore.clear();
    setMessage("Signed out; the access token was cleared from memory");
  }

  async function createOrder() {
    const tokens = tokenStore.get();
    if (!tokens || tokens.expiresAt <= Date.now()) {
      setMessage("Sign in before creating an order");
      return;
    }

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestFingerprint: crypto.randomUUID(),
        items: [{ sku: "sku-1", quantity: 1 }],
      }),
    });
    setMessage(response.ok ? "Order accepted and awaiting stock" : `Order request failed (${response.status})`);
  }

  return (
    <main>
      <h1>GuardMesh</h1>
      <p>Security-focused distributed-systems demonstration.</p>
      <p aria-live="polite">{message}</p>
      <button type="button" onClick={() => void signIn()}>Sign in</button>{" "}
      <button type="button" onClick={signOut}>Clear session</button>
      <button type="button" onClick={() => void createOrder()}>Create demo order</button>
      <section>
        <h2>Demo flows</h2>
        <ul>
          <li>Create an authorized order.</li>
          <li>Attempt a cross-location read.</li>
          <li>Inspect security events and alerts.</li>
        </ul>
      </section>
    </main>
  );
}
