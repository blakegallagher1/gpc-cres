import { describe, it, expect } from "vitest";
import { ensureStrictJsonSchema } from "../strictJsonSchema.js";

describe("ensureStrictJsonSchema", () => {
  it("removes format: uri from string properties", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        website: {
          type: "string",
          format: "uri",
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    expect(result.properties).toBeDefined();
    const websiteSchema = (result.properties as Record<string, unknown>)
      .website as Record<string, unknown>;
    expect(websiteSchema.format).toBeUndefined();
    expect(websiteSchema.type).toBe("string");
  });

  it("removes format: email from string properties", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        email: {
          type: "string",
          format: "email",
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    expect(result.properties).toBeDefined();
    const emailSchema = (result.properties as Record<string, unknown>)
      .email as Record<string, unknown>;
    expect(emailSchema.format).toBeUndefined();
    expect(emailSchema.type).toBe("string");
  });

  it("removes unsupported numeric constraints (minimum, maximum, etc.)", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        age: {
          type: "number",
          minimum: 0,
          maximum: 150,
          exclusiveMinimum: false,
          exclusiveMaximum: true,
          multipleOf: 5,
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    const ageSchema = (result.properties as Record<string, unknown>)
      .age as Record<string, unknown>;
    expect(ageSchema.minimum).toBeUndefined();
    expect(ageSchema.maximum).toBeUndefined();
    expect(ageSchema.exclusiveMinimum).toBeUndefined();
    expect(ageSchema.exclusiveMaximum).toBeUndefined();
    expect(ageSchema.multipleOf).toBeUndefined();
    expect(ageSchema.type).toBe("number");
  });

  it("removes unsupported string constraints (pattern, minLength, maxLength)", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        username: {
          type: "string",
          pattern: "^[a-z0-9]+$",
          minLength: 3,
          maxLength: 20,
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    const usernameSchema = (result.properties as Record<string, unknown>)
      .username as Record<string, unknown>;
    expect(usernameSchema.pattern).toBeUndefined();
    expect(usernameSchema.minLength).toBeUndefined();
    expect(usernameSchema.maxLength).toBeUndefined();
    expect(usernameSchema.type).toBe("string");
  });

  it("removes unsupported array constraints (minItems, maxItems, uniqueItems)", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 10,
          uniqueItems: true,
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    const tagsSchema = (result.properties as Record<string, unknown>)
      .tags as Record<string, unknown>;
    expect(tagsSchema.minItems).toBeUndefined();
    expect(tagsSchema.maxItems).toBeUndefined();
    expect(tagsSchema.uniqueItems).toBeUndefined();
    expect(tagsSchema.type).toBe("array");
  });

  it("adds additionalProperties: false to all objects", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        name: { type: "string" },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    expect(result.additionalProperties).toBe(false);
  });

  it("does not override explicit additionalProperties: true", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      additionalProperties: true,
    };

    const result = ensureStrictJsonSchema(schema);

    expect(result.additionalProperties).toBe(true);
  });

  it("ensures required includes all property keys", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
      },
      required: ["firstName"],
    };

    const result = ensureStrictJsonSchema(schema);

    expect(result.required).toBeDefined();
    const required = result.required as string[];
    expect(required).toContain("firstName");
    expect(required).toContain("lastName");
    expect(required).toContain("email");
    expect(required.length).toBe(3);
  });

  it("creates required array if none exists and properties are present", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    expect(result.required).toBeDefined();
    const required = result.required as string[];
    expect(required).toContain("id");
    expect(required).toContain("name");
  });

  it("recursively processes nested objects", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            email: {
              type: "string",
              format: "email",
            },
            website: {
              type: "string",
              format: "uri",
            },
          },
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    const userSchema = (result.properties as Record<string, unknown>)
      .user as Record<string, unknown>;
    expect(userSchema.additionalProperties).toBe(false);

    const userProperties = userSchema.properties as Record<string, unknown>;
    const emailSchema = userProperties.email as Record<string, unknown>;
    const websiteSchema = userProperties.website as Record<string, unknown>;

    expect(emailSchema.format).toBeUndefined();
    expect(websiteSchema.format).toBeUndefined();
  });

  it("recursively processes array items", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        users: {
          type: "array",
          items: {
            type: "object",
            properties: {
              email: {
                type: "string",
                format: "email",
              },
            },
          },
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    const usersSchema = (result.properties as Record<string, unknown>)
      .users as Record<string, unknown>;
    const itemsSchema = usersSchema.items as Record<string, unknown>;

    expect(itemsSchema.additionalProperties).toBe(false);
    expect(
      ((itemsSchema.properties as Record<string, unknown>)
        .email as Record<string, unknown>).format,
    ).toBeUndefined();
  });

  it("preserves enum values", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "inactive", "pending"],
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    const statusSchema = (result.properties as Record<string, unknown>)
      .status as Record<string, unknown>;
    expect(statusSchema.enum).toEqual(["active", "inactive", "pending"]);
  });

  it("preserves const values", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        version: {
          const: "1.0.0",
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    const versionSchema = (result.properties as Record<string, unknown>)
      .version as Record<string, unknown>;
    expect(versionSchema.const).toBe("1.0.0");
  });

  it("preserves default values", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        count: {
          type: "number",
          default: 0,
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    const countSchema = (result.properties as Record<string, unknown>)
      .count as Record<string, unknown>;
    expect(countSchema.default).toBe(0);
  });

  it("is a no-op on already-compliant schemas", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
      required: ["id", "name"],
      additionalProperties: false,
    };

    const result = ensureStrictJsonSchema(schema);

    expect(result.type).toBe("object");
    expect(result.additionalProperties).toBe(false);
    expect(result.required).toEqual(["id", "name"]);
  });

  it("handles anyOf schemas", () => {
    const schema: Record<string, unknown> = {
      anyOf: [
        {
          type: "object",
          properties: {
            email: {
              type: "string",
              format: "email",
            },
          },
        },
        {
          type: "object",
          properties: {
            phone: {
              type: "string",
              pattern: "^[0-9-]+$",
            },
          },
        },
      ],
    };

    const result = ensureStrictJsonSchema(schema);

    const anyOf = result.anyOf as Array<Record<string, unknown>>;
    expect(anyOf).toBeDefined();
    expect(anyOf.length).toBe(2);

    const emailSchema = (anyOf[0].properties as Record<string, unknown>)
      .email as Record<string, unknown>;
    expect(emailSchema.format).toBeUndefined();

    const phoneSchema = (anyOf[1].properties as Record<string, unknown>)
      .phone as Record<string, unknown>;
    expect(phoneSchema.pattern).toBeUndefined();
  });

  it("handles oneOf schemas", () => {
    const schema: Record<string, unknown> = {
      oneOf: [
        {
          type: "object",
          properties: {
            website: {
              type: "string",
              format: "uri",
            },
          },
        },
        {
          type: "object",
          properties: {
            code: {
              type: "string",
              minLength: 5,
            },
          },
        },
      ],
    };

    const result = ensureStrictJsonSchema(schema);

    const oneOf = result.oneOf as Array<Record<string, unknown>>;
    expect(oneOf).toBeDefined();
    expect(oneOf.length).toBe(2);

    const websiteSchema = (oneOf[0].properties as Record<string, unknown>)
      .website as Record<string, unknown>;
    expect(websiteSchema.format).toBeUndefined();

    const codeSchema = (oneOf[1].properties as Record<string, unknown>)
      .code as Record<string, unknown>;
    expect(codeSchema.minLength).toBeUndefined();
  });

  it("handles $defs references", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        user: { $ref: "#/$defs/User" },
      },
      $defs: {
        User: {
          type: "object",
          properties: {
            email: {
              type: "string",
              format: "email",
            },
          },
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    const defs = result.$defs as Record<string, Record<string, unknown>>;
    expect(defs).toBeDefined();
    expect(defs.User).toBeDefined();
    expect(defs.User.additionalProperties).toBe(false);

    const userEmail = (defs.User.properties as Record<string, unknown>)
      .email as Record<string, unknown>;
    expect(userEmail.format).toBeUndefined();
  });

  it("removes all unsupported format constraints", () => {
    const formats = [
      "uri",
      "url",
      "email",
      "hostname",
      "ipv4",
      "ipv6",
      "date",
      "date-time",
      "time",
      "duration",
      "uuid",
      "regex",
      "json-pointer",
      "relative-json-pointer",
      "uri-reference",
      "uri-template",
      "iri",
      "iri-reference",
    ];

    for (const format of formats) {
      const schema: Record<string, unknown> = {
        type: "object",
        properties: {
          field: {
            type: "string",
            format,
          },
        },
      };

      const result = ensureStrictJsonSchema(schema);
      const fieldSchema = (result.properties as Record<string, unknown>)
        .field as Record<string, unknown>;

      expect(fieldSchema.format).toBeUndefined();
    }
  });

  it("preserves non-unsupported formats", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        field: {
          type: "string",
          format: "custom-format",
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    const fieldSchema = (result.properties as Record<string, unknown>)
      .field as Record<string, unknown>;
    expect(fieldSchema.format).toBe("custom-format");
  });

  it("handles complex nested structures with multiple constraint types", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {
        profile: {
          type: "object",
          properties: {
            contact: {
              type: "object",
              properties: {
                email: {
                  type: "string",
                  format: "email",
                  minLength: 5,
                  maxLength: 100,
                },
                website: {
                  type: "string",
                  format: "uri",
                  pattern: "^https://",
                },
              },
            },
            addresses: {
              type: "array",
              minItems: 1,
              maxItems: 5,
              items: {
                type: "object",
                properties: {
                  country: {
                    type: "string",
                    enum: ["US", "CA", "MX"],
                  },
                  zip: {
                    type: "string",
                    pattern: "^[0-9]{5}$",
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    // Verify nested objects have additionalProperties: false
    const profileSchema = (result.properties as Record<string, unknown>)
      .profile as Record<string, unknown>;
    expect(profileSchema.additionalProperties).toBe(false);

    const contactSchema = (profileSchema.properties as Record<string, unknown>)
      .contact as Record<string, unknown>;
    expect(contactSchema.additionalProperties).toBe(false);

    // Verify formats are removed
    const emailSchema = (contactSchema.properties as Record<string, unknown>)
      .email as Record<string, unknown>;
    expect(emailSchema.format).toBeUndefined();
    expect(emailSchema.minLength).toBeUndefined();
    expect(emailSchema.maxLength).toBeUndefined();

    const websiteSchema = (contactSchema.properties as Record<string, unknown>)
      .website as Record<string, unknown>;
    expect(websiteSchema.format).toBeUndefined();
    expect(websiteSchema.pattern).toBeUndefined();

    // Verify array constraints are removed
    const addressesSchema = (profileSchema.properties as Record<string, unknown>)
      .addresses as Record<string, unknown>;
    expect(addressesSchema.minItems).toBeUndefined();
    expect(addressesSchema.maxItems).toBeUndefined();

    // Verify enum is preserved
    const itemsSchema = addressesSchema.items as Record<string, unknown>;
    const countrySchema = (itemsSchema.properties as Record<string, unknown>)
      .country as Record<string, unknown>;
    expect(countrySchema.enum).toEqual(["US", "CA", "MX"]);

    // Verify pattern is removed from zip
    const zipSchema = (itemsSchema.properties as Record<string, unknown>)
      .zip as Record<string, unknown>;
    expect(zipSchema.pattern).toBeUndefined();
  });

  it("does not add required array when properties is empty", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      properties: {},
    };

    const result = ensureStrictJsonSchema(schema);

    // Should not add required since there are no properties
    expect(result.required).toBeUndefined();
  });

  it("preserves description and title fields", () => {
    const schema: Record<string, unknown> = {
      type: "object",
      title: "User",
      description: "A user object",
      properties: {
        name: {
          type: "string",
          description: "User name",
          title: "Name",
        },
      },
    };

    const result = ensureStrictJsonSchema(schema);

    expect(result.title).toBe("User");
    expect(result.description).toBe("A user object");

    const nameSchema = (result.properties as Record<string, unknown>)
      .name as Record<string, unknown>;
    expect(nameSchema.description).toBe("User name");
    expect(nameSchema.title).toBe("Name");
  });

  it("handles allOf schemas", () => {
    const schema: Record<string, unknown> = {
      allOf: [
        {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
        {
          type: "object",
          properties: {
            name: {
              type: "string",
              minLength: 1,
            },
          },
        },
      ],
    };

    const result = ensureStrictJsonSchema(schema);

    const allOf = result.allOf as Array<Record<string, unknown>>;
    expect(allOf).toBeDefined();
    expect(allOf.length).toBe(2);

    const nameSchema = (allOf[1].properties as Record<string, unknown>)
      .name as Record<string, unknown>;
    expect(nameSchema.minLength).toBeUndefined();
  });
});
