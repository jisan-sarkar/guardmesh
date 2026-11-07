import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

export type JwtVerifierConfig = Readonly<{
  issuer: string;
  audience: string;
  jwksUri: URL;
}>;

export type VerifiedAccessToken = Readonly<{
  subject: string;
  issuer: string;
  audience: string[];
  expiresAt: number;
  issuedAt?: number;
}>;

export class AccessTokenVerificationError extends Error {
  public constructor(message = "access token verification failed") {
    super(message);
    this.name = "AccessTokenVerificationError";
  }
}

function toAudienceList(audience: string | string[] | undefined): string[] {
  return audience === undefined ? [] : typeof audience === "string" ? [audience] : audience;
}

function toVerifiedAccessToken(payload: JWTPayload): VerifiedAccessToken {
  if (
    typeof payload.sub !== "string" ||
    typeof payload.iss !== "string" ||
    typeof payload.exp !== "number"
  ) {
    throw new AccessTokenVerificationError("verified token is missing required claims");
  }

  const audience = toAudienceList(payload.aud);
  if (audience.length === 0) {
    throw new AccessTokenVerificationError("verified token has no audience");
  }

  return {
    subject: payload.sub,
    issuer: payload.iss,
    audience,
    expiresAt: payload.exp,
    ...(typeof payload.iat === "number" ? { issuedAt: payload.iat } : {}),
  };
}

export function createAccessTokenVerifier(config: JwtVerifierConfig): (token: string) => Promise<VerifiedAccessToken> {
  const jwks = createRemoteJWKSet(config.jwksUri);
  return createVerifier(jwks, config);
}

export function createVerifier(
  getKey: JWTVerifyGetKey,
  config: Omit<JwtVerifierConfig, "jwksUri">,
): (token: string) => Promise<VerifiedAccessToken> {
  return async (token: string): Promise<VerifiedAccessToken> => {
    try {
      const { payload } = await jwtVerify(token, getKey, {
        issuer: config.issuer,
        audience: config.audience,
        requiredClaims: ["sub", "iss", "aud", "exp"],
      });

      return toVerifiedAccessToken(payload);
    } catch (error) {
      if (error instanceof AccessTokenVerificationError) {
        throw error;
      }

      throw new AccessTokenVerificationError();
    }
  };
}
