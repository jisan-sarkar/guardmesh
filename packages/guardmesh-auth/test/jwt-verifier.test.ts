import { createLocalJWKSet, generateKeyPair, SignJWT, exportJWK } from "jose";
import { describe, expect, it } from "vitest";

import {
  AccessTokenVerificationError,
  createVerifier,
} from "../src/jwt-verifier.js";

const issuer = "https://identity.example.test/realms/guardmesh";
const audience = "orders-api";

async function createVerifierFixture() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const keySet = createLocalJWKSet({ keys: [{ ...jwk, kid: "test-key", alg: "RS256" }] });
  const verifier = createVerifier(keySet, { issuer, audience });

  return {
    privateKey,
    verifier,
  };
}

async function createToken(
  privateKey: CryptoKey,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  return new SignJWT({ ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("cashier-1")
    .setIssuedAt()
    .setExpirationTime("5 minutes")
    .sign(privateKey);
}

describe("JWT access-token verification", () => {
  it("accepts a correctly signed token with the expected claims", async () => {
    const { privateKey, verifier } = await createVerifierFixture();
    const token = await createToken(privateKey);

    await expect(verifier(token)).resolves.toMatchObject({
      subject: "cashier-1",
      issuer,
      audience: [audience],
      scopes: [],
    });
  });

  it("normalizes space-delimited scopes", async () => {
    const { privateKey, verifier } = await createVerifierFixture();
    const token = await createToken(privateKey, { scope: "openid inventory.catalog.read" });
    await expect(verifier(token)).resolves.toMatchObject({ scopes: ["openid", "inventory.catalog.read"] });
  });

  it("rejects a token with the wrong audience", async () => {
    const { privateKey, verifier } = await createVerifierFixture();
    const token = await new SignJWT()
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer)
      .setAudience("inventory-api")
      .setSubject("cashier-1")
      .setIssuedAt()
      .setExpirationTime("5 minutes")
      .sign(privateKey);

    await expect(verifier(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it("rejects an expired token", async () => {
    const { privateKey, verifier } = await createVerifierFixture();
    const token = await new SignJWT()
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject("cashier-1")
      .setIssuedAt(10)
      .setExpirationTime(20)
      .sign(privateKey);

    await expect(verifier(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it("rejects a token signed by an untrusted key", async () => {
    const { privateKey: trustedKey, verifier } = await createVerifierFixture();
    const { privateKey: untrustedKey } = await generateKeyPair("RS256");
    const token = await createToken(untrustedKey);

    expect(trustedKey).toBeDefined();
    await expect(verifier(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it("rejects a token without a subject", async () => {
    const { privateKey, verifier } = await createVerifierFixture();
    const token = await new SignJWT()
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5 minutes")
      .sign(privateKey);

    await expect(verifier(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });
});
