import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./localAuth";

describe("local authentication password handling", () => {
  it("hashes a password and verifies the original value", () => {
    const stored = hashPassword("StrongPassword123", "fixed-salt-for-test");
    expect(stored).not.toContain("StrongPassword123");
    expect(verifyPassword("StrongPassword123", stored)).toBe(true);
    expect(verifyPassword("WrongPassword123", stored)).toBe(false);
  });
});
