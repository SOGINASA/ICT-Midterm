import {
  emailSchema,
  loginSchema,
  registrationSchema,
  resetPasswordSchema,
} from "./authValidation";

const validRegistration = {
  displayName: "Ayan",
  email: "ayan@example.com",
  password: "A secure password",
  confirmPassword: "A secure password",
};

describe("account validation", () => {
  it("normalizes email and name while preserving the exact password", () => {
    const password = " my password ";
    const result = registrationSchema.parse({
      ...validRegistration,
      displayName: "  Ayan  ",
      email: "  Ayan@Example.COM  ",
      password,
      confirmPassword: password,
    });
    expect(result).toEqual({
      displayName: "Ayan",
      email: "ayan@example.com",
      password,
      confirmPassword: password,
    });
  });

  it.each(["", "   ", "ayan", "ayan@", "ayan example.com", "ayan@example"])(
    "rejects an invalid email: %s",
    (email) => expect(emailSchema.safeParse(email).success).toBe(false),
  );

  it("rejects names that are blank after trimming or too long", () => {
    for (const displayName of ["  ", " A ", "a".repeat(61)]) {
      const result = registrationSchema.safeParse({
        ...validRegistration,
        displayName,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.displayName).toBeDefined();
      }
    }
  });

  it.each([7, 73])("rejects a new password with %i characters", (length) => {
    const password = "a".repeat(length);
    const value = { ...validRegistration, password, confirmPassword: password };
    expect(registrationSchema.safeParse(value).success).toBe(false);
    expect(resetPasswordSchema.safeParse(value).success).toBe(false);
  });

  it.each([8, 72])("accepts a new password with %i characters", (length) => {
    const password = "a".repeat(length);
    const value = { ...validRegistration, password, confirmPassword: password };
    expect(registrationSchema.safeParse(value).success).toBe(true);
    expect(resetPasswordSchema.safeParse(value).success).toBe(true);
  });

  it("attaches password mismatch errors to confirmation in both new-password flows", () => {
    const value = {
      ...validRegistration,
      confirmPassword: "Different password",
    };
    for (const schema of [registrationSchema, resetPasswordSchema]) {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.confirmPassword).toEqual([
          "Passwords don’t match.",
        ]);
      }
    }
  });

  it("requires a login password without applying new-password rules to existing accounts", () => {
    expect(
      loginSchema.safeParse({ email: "ayan@example.com", password: "" })
        .success,
    ).toBe(false);
    expect(
      loginSchema.parse({ email: " Ayan@Example.com ", password: "old" }),
    ).toEqual({
      email: "ayan@example.com",
      password: "old",
    });
  });
});
