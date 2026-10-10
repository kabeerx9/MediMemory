import { describe, expect, test } from "vitest";

import { describeTrust } from "./use-oauth-client";

const search = (redirect: string) => `?client_id=x&redirect_uri=${encodeURIComponent(redirect)}&sig=s`;

describe("describeTrust", () => {
  test("flags an app whose claimed site differs from where access goes", () => {
    const impostor = { clientId: "abc", name: "Claude", icon: null, uri: "https://claude.ai" };
    expect(describeTrust(impostor, search("https://attacker.example/cb"))).toMatchObject({
      redirectHost: "attacker.example",
      verified: false,
      mismatch: true,
    });
  });

  test("verifies a metadata-document client whose domain matches the redirect", () => {
    const cimd = { clientId: "https://claude.ai/oauth/client.json", name: "Claude", icon: null, uri: "https://claude.ai" };
    expect(describeTrust(cimd, search("https://claude.ai/api/mcp/auth_callback"))).toMatchObject({
      verified: true,
      mismatch: false,
    });
  });

  test("never verifies a dynamically registered client, however it names itself", () => {
    const dcr = { clientId: "random-id", name: "Claude", icon: null, uri: "https://claude.ai" };
    expect(describeTrust(dcr, search("https://claude.ai/api/mcp/auth_callback"))).toMatchObject({
      verified: false,
      mismatch: false,
    });
  });
});
