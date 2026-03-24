import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";
import { generateAscToken } from "../../src/sources/asc-auth.js";

const { privateKey: testKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  privateKeyEncoding: { type: "sec1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

describe("generateAscToken", () => {
  it("generates a valid ES256 JWT with correct claims", () => {
    const token = generateAscToken("issuer-123", "key-456", testKey);
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded?.header.alg).toBe("ES256");
    expect(decoded?.header.kid).toBe("key-456");
    expect(decoded?.header.typ).toBe("JWT");
    expect((decoded?.payload as any).iss).toBe("issuer-123");
    expect((decoded?.payload as any).aud).toBe("appstoreconnect-v1");
  });

  it("sets expiration to 20 minutes", () => {
    const token = generateAscToken("issuer-123", "key-456", testKey);
    const decoded = jwt.decode(token, { complete: true });
    const payload = decoded?.payload as any;
    expect(payload.exp - payload.iat).toBe(20 * 60);
  });
});
