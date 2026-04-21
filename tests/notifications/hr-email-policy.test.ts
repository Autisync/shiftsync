import { describe, expect, it } from "vitest";
import {
  buildHrCcList,
  isValidEmail,
  normalizeEmailList,
} from "../../supabase/functions/_shared/hr-email-policy";

describe("hr-email-policy", () => {
  it("validates expected email formats", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail(" user@example.com ")).toBe(true);
    expect(isValidEmail("bad-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });

  it("normalizes, filters invalid values, and deduplicates cc emails", () => {
    const result = normalizeEmailList([
      "Manager@Example.com",
      "manager@example.com",
      "",
      "not-an-email",
      " backup@example.com ",
      undefined,
      null,
    ]);

    expect(result).toEqual(["manager@example.com", "backup@example.com"]);
  });

  it("always includes actor email in cc list", () => {
    const cc = buildHrCcList({
      configuredCcEmails: ["hr+backup@example.com"],
      actorEmail: "actor@example.com",
    });

    expect(cc).toContain("hr+backup@example.com");
    expect(cc).toContain("actor@example.com");
  });

  it("does not duplicate actor email when already configured in cc", () => {
    const cc = buildHrCcList({
      configuredCcEmails: ["Actor@Example.com", "other@example.com"],
      actorEmail: "actor@example.com",
    });

    expect(cc).toEqual(["actor@example.com", "other@example.com"]);
  });
});
