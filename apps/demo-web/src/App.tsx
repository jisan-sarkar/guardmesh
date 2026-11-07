import { useState } from "react";

import { createAuthorizationUrl, MemoryTokenStore } from "./auth";

const tokenStore = new MemoryTokenStore();
const oidcConfig = {
  issuer: import.meta.env.VITE_OIDC_ISSUER ?? "http://localhost:8080/realms/guardmesh",
  clientId: import.meta.env.VITE_OIDC_CLIENT_ID ?? "demo-web",
  redirectUri: `${window.location.origin}/callback`,
  scope: "openid profile",
};

export function App() {
  const [message, setMessage] = useState("Not authenticated");

  async function signIn() {
    const { url, verifier } = await createAuthorizationUrl(oidcConfig);
    sessionStorage.setItem("guardmesh.pkce_verifier", verifier);
    window.location.assign(url);
  }

  function signOut() {
    tokenStore.clear();
    setMessage("Signed out; the access token was cleared from memory");
  }

  return (
    <main>
      <h1>GuardMesh</h1>
      <p>Security-focused distributed-systems demonstration.</p>
      <p aria-live="polite">{message}</p>
      <button type="button" onClick={() => void signIn()}>Sign in</button>{" "}
      <button type="button" onClick={signOut}>Clear session</button>
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
