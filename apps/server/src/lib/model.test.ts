import { describe, expect, it } from "vitest";

import * as modelModule from "./model";

describe("OpenRouter chat request configuration", () => {
  it("pins a conversation and requests the configured reasoning effort", () => {
    const buildChatExtraBody = Reflect.get(modelModule, "buildChatExtraBody");

    expect(buildChatExtraBody).toBeTypeOf("function");
    expect(buildChatExtraBody("session-123", "medium")).toEqual({
      session_id: "session-123",
      reasoning: { effort: "medium" },
    });
  });
});
