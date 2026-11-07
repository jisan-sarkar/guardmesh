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
  const [inventory, setInventory] = useState<Record<string, unknown> | undefined>();
  const [alerts, setAlerts] = useState<unknown[] | undefined>();
  const [events, setEvents] = useState<unknown[] | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const callback = new URL(window.location.href);
    const code = callback.searchParams.get("code");
    const returnedState = callback.searchParams.get("state");
    if (callback.pathname !== "/callback" || !code) return;

    const verifier = sessionStorage.getItem("guardmesh.pkce_verifier");
    const expectedState = sessionStorage.getItem("guardmesh.oidc_state");
    const expectedNonce = sessionStorage.getItem("guardmesh.oidc_nonce");
    if (!verifier || !expectedState || !expectedNonce || returnedState !== expectedState) {
      setMessage("Sign-in could not be completed: the PKCE verifier is missing");
      return;
    }

    void exchangeAuthorizationCode({
      issuer: oidcConfig.issuer,
      clientId: oidcConfig.clientId,
      redirectUri: oidcConfig.redirectUri,
      code,
      verifier,
      expectedNonce,
    }).then((tokens) => {
      tokenStore.set(tokens);
      sessionStorage.removeItem("guardmesh.pkce_verifier");
      sessionStorage.removeItem("guardmesh.oidc_state");
      sessionStorage.removeItem("guardmesh.oidc_nonce");
      window.history.replaceState({}, "", "/");
      setMessage("Authenticated; access token is held in memory");
      void refreshOperatorData(tokens.accessToken);
    }).catch(() => setMessage("Sign-in failed; please try again"));
  }, []);

  async function signIn() {
    const { url, verifier, state, nonce } = await createAuthorizationUrl(oidcConfig);
    sessionStorage.setItem("guardmesh.pkce_verifier", verifier);
    sessionStorage.setItem("guardmesh.oidc_state", state);
    sessionStorage.setItem("guardmesh.oidc_nonce", nonce);
    window.location.assign(url);
  }

  async function apiGet(path: string, accessToken: string): Promise<unknown> {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
  }

  async function refreshOperatorData(accessToken = tokenStore.get()?.accessToken): Promise<void> {
    if (!accessToken) {
      setMessage("Sign in before loading operator data");
      return;
    }
    setLoading(true);
    try {
      const [inventoryResponse, eventsResponse, alertsResponse] = await Promise.allSettled([
        apiGet("/api/inventory", accessToken),
        apiGet("/api/security/events?limit=25", accessToken),
        apiGet("/api/security/alerts?limit=25&status=OPEN", accessToken),
      ]);
      if (inventoryResponse.status === "fulfilled") {
        setInventory(inventoryResponse.value as Record<string, unknown>);
      }
      if (eventsResponse.status === "fulfilled") {
        setEvents((eventsResponse.value as { items?: unknown[] }).items ?? []);
      }
      if (alertsResponse.status === "fulfilled") {
        setAlerts((alertsResponse.value as { items?: unknown[] }).items ?? []);
      }
      const failures = [inventoryResponse, eventsResponse, alertsResponse].filter((result) => result.status === "rejected");
      setMessage(failures.length === 0 ? "Operator data refreshed" : "Some operator data is unavailable; check permissions or service health");
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    tokenStore.clear();
    setInventory(undefined);
    setEvents(undefined);
    setAlerts(undefined);
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
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
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
      <button type="button" onClick={() => void refreshOperatorData()} disabled={loading}>
        {loading ? "Refreshing…" : "Refresh operator data"}
      </button>
      <section>
        <h2>Demo flows</h2>
        <ul>
          <li>Create an authorized order.</li>
          <li>Attempt a cross-location read.</li>
          <li>Inspect security events and alerts.</li>
        </ul>
      </section>
      <section aria-labelledby="inventory-heading">
        <h2 id="inventory-heading">Inventory</h2>
        {inventory === undefined ? <p>Inventory has not been loaded.</p> : <pre>{JSON.stringify(inventory, null, 2)}</pre>}
      </section>
      <section aria-labelledby="security-heading">
        <h2 id="security-heading">Security telemetry</h2>
        {alerts === undefined ? <p>Alerts have not been loaded.</p> : alerts.length === 0 ? <p>No open alerts returned. This is not proof that the system is secure.</p> : <pre>{JSON.stringify(alerts, null, 2)}</pre>}
        {events === undefined ? <p>Events have not been loaded.</p> : events.length === 0 ? <p>No events returned.</p> : <pre>{JSON.stringify(events, null, 2)}</pre>}
      </section>
    </main>
  );
}
