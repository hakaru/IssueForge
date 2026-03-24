import jwt from "jsonwebtoken";

export function generateAscToken(issuerId: string, keyId: string, privateKey: string): string {
  return jwt.sign(
    { iss: issuerId, aud: "appstoreconnect-v1" },
    privateKey,
    {
      algorithm: "ES256",
      expiresIn: 20 * 60,
      header: { alg: "ES256", kid: keyId, typ: "JWT" },
    }
  );
}
