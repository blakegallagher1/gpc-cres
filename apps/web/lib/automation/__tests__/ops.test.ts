import { isMigrationSafe, evaluateHealth, shouldAlertOnFailure } from "../ops";

describe("ops", () => {
  describe("isMigrationSafe", () => {
    describe("safe migrations", () => {
      it("should allow CREATE TABLE", () => {
        const result = isMigrationSafe('CREATE TABLE "users" (id TEXT PRIMARY KEY);');
        expect(result.safe).toBe(true);
        expect(result.destructiveOperations).toHaveLength(0);
      });

      it("should allow ALTER TABLE ADD COLUMN", () => {
        const result = isMigrationSafe(
          'ALTER TABLE "deals" ADD COLUMN "source" TEXT;'
        );
        expect(result.safe).toBe(true);
        expect(result.destructiveOperations).toHaveLength(0);
      });

      it("should allow CREATE INDEX", () => {
        const result = isMigrationSafe(
          'CREATE INDEX "idx_deals_status" ON "deals" ("status");'
        );
        expect(result.safe).toBe(true);
        expect(result.destructiveOperations).toHaveLength(0);
      });

      it("should allow ALTER TYPE ADD VALUE (enum extension)", () => {
        const result = isMigrationSafe(
          "ALTER TYPE \"run_type\" ADD VALUE 'ENRICHMENT';"
        );
        expect(result.safe).toBe(true);
        expect(result.destructiveOperations).toHaveLength(0);
      });

      it("should allow INSERT statements", () => {
        const result = isMigrationSafe(
          "INSERT INTO jurisdictions (name) VALUES ('East Baton Rouge');"
        );
        expect(result.safe).toBe(true);
        expect(result.destructiveOperations).toHaveLength(0);
      });

      it("should allow UPDATE statements", () => {
        const result = isMigrationSafe(
          "UPDATE deals SET source = 'manual' WHERE source IS NULL;"
        );
        expect(result.safe).toBe(true);
        expect(result.destructiveOperations).toHaveLength(0);
      });

      it("should allow empty SQL", () => {
        const result = isMigrationSafe("");
        expect(result.safe).toBe(true);
        expect(result.destructiveOperations).toHaveLength(0);
      });
    });

    describe("destructive migrations", () => {
      it("should flag DROP TABLE", () => {
        const result = isMigrationSafe('DROP TABLE "users";');
        expect(result.safe).toBe(false);
        expect(result.destructiveOperations).toContain("DROP TABLE");
      });

      it("should flag DROP TABLE CASCADE", () => {
        const result = isMigrationSafe('DROP TABLE "users" CASCADE;');
        expect(result.safe).toBe(false);
        expect(result.destructiveOperations).toContain("DROP TABLE");
      });

      it("should flag TRUNCATE", () => {
        const result = isMigrationSafe('TRUNCATE TABLE "deals";');
        expect(result.safe).toBe(false);
        expect(result.destructiveOperations).toContain("TRUNCATE");
      });

      it("should flag ALTER TABLE DROP COLUMN", () => {
        const result = isMigrationSafe(
          'ALTER TABLE "deals" DROP COLUMN "old_field";'
        );
        expect(result.safe).toBe(false);
        expect(result.destructiveOperations).toContain(
          "ALTER TABLE DROP COLUMN"
        );
      });

      it("should flag DROP SCHEMA", () => {
        const result = isMigrationSafe("DROP SCHEMA public CASCADE;");
        expect(result.safe).toBe(false);
        expect(result.destructiveOperations).toContain("DROP SCHEMA");
      });

      it("should flag DROP DATABASE", () => {
        const result = isMigrationSafe("DROP DATABASE entitlement_os;");
        expect(result.safe).toBe(false);
        expect(result.destructiveOperations).toContain("DROP DATABASE");
      });

      it("should flag DELETE FROM", () => {
        const result = isMigrationSafe('DELETE FROM "tasks" WHERE status = \'DONE\';');
        expect(result.safe).toBe(false);
        expect(result.destructiveOperations).toContain("DELETE FROM");
      });

      it("should flag DROP INDEX", () => {
        const result = isMigrationSafe('DROP INDEX "idx_deals_status";');
        expect(result.safe).toBe(false);
        expect(result.destructiveOperations).toContain("DROP INDEX");
      });

      it("should flag DROP TYPE", () => {
        const result = isMigrationSafe('DROP TYPE "run_type";');
        expect(result.safe).toBe(false);
        expect(result.destructiveOperations).toContain("DROP TYPE");
      });

      it("should flag ALTER TABLE DROP CONSTRAINT", () => {
        const result = isMigrationSafe(
          'ALTER TABLE "deals" DROP CONSTRAINT "fk_org";'
        );
        expect(result.safe).toBe(false);
        expect(result.destructiveOperations).toContain(
          "ALTER TABLE DROP CONSTRAINT"
        );
      });
    });

    describe("mixed migrations", () => {
      it("should flag all destructive operations in a multi-statement migration", () => {
        const sql = `
          CREATE TABLE "new_table" (id TEXT PRIMARY KEY);
          DROP TABLE "old_table";
          ALTER TABLE "deals" DROP COLUMN "deprecated_field";
          TRUNCATE TABLE "logs";
        `;
        const result = isMigrationSafe(sql);
        expect(result.safe).toBe(false);
        expect(result.destructiveOperations).toContain("DROP TABLE");
        expect(result.destructiveOperations).toContain(
          "ALTER TABLE DROP COLUMN"
        );
        expect(result.destructiveOperations).toContain("TRUNCATE");
      });
    });

    describe("case insensitivity", () => {
      it("should detect lowercase drop table", () => {
        const result = isMigrationSafe("drop table users;");
        expect(result.safe).toBe(false);
      });

      it("should detect mixed case truncate", () => {
        const result = isMigrationSafe("Truncate Table deals;");
        expect(result.safe).toBe(false);
      });
    });
  });

  describe("evaluateHealth", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return "ok" when all critical vars are present', () => {
      process.env.DATABASE_URL = "postgresql://localhost/test";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
      process.env.OPENAI_API_KEY = "sk-test";

      const result = evaluateHealth();
      expect(result.status).toBe("ok");
      expect(result.missingVars).toHaveLength(0);
      expect(result.timestamp).toBeDefined();
    });

    it('should return "down" when DATABASE_URL is missing', () => {
      delete process.env.DATABASE_URL;
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
      process.env.OPENAI_API_KEY = "sk-test";

      const result = evaluateHealth();
      expect(result.status).toBe("down");
      expect(result.missingVars).toContain("DATABASE_URL");
    });

    it('should return "down" when OPENAI_API_KEY is missing', () => {
      process.env.DATABASE_URL = "postgresql://localhost/test";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
      delete process.env.OPENAI_API_KEY;

      const result = evaluateHealth();
      expect(result.status).toBe("down");
      expect(result.missingVars).toContain("OPENAI_API_KEY");
    });

    it('should return "degraded" when non-critical vars missing', () => {
      process.env.DATABASE_URL = "postgresql://localhost/test";
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.OPENAI_API_KEY = "sk-test";

      const result = evaluateHealth();
      expect(result.status).toBe("degraded");
      expect(result.missingVars.length).toBeGreaterThan(0);
    });

    it("should include ISO timestamp", () => {
      process.env.DATABASE_URL = "postgresql://localhost/test";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
      process.env.OPENAI_API_KEY = "sk-test";

      const result = evaluateHealth();
      expect(() => new Date(result.timestamp)).not.toThrow();
    });
  });

  describe("shouldAlertOnFailure", () => {
    it("should not alert for 0 failures", () => {
      expect(shouldAlertOnFailure(0)).toBe(false);
    });

    it("should not alert for 1 failure", () => {
      expect(shouldAlertOnFailure(1)).toBe(false);
    });

    it("should not alert for 2 failures", () => {
      expect(shouldAlertOnFailure(2)).toBe(false);
    });

    it("should alert for 3 consecutive failures (default threshold)", () => {
      expect(shouldAlertOnFailure(3)).toBe(true);
    });

    it("should alert for more than 3 failures", () => {
      expect(shouldAlertOnFailure(5)).toBe(true);
      expect(shouldAlertOnFailure(10)).toBe(true);
    });

    it("should respect custom threshold", () => {
      expect(shouldAlertOnFailure(4, 5)).toBe(false);
      expect(shouldAlertOnFailure(5, 5)).toBe(true);
      expect(shouldAlertOnFailure(6, 5)).toBe(true);
    });

    it("should alert immediately with threshold 1", () => {
      expect(shouldAlertOnFailure(1, 1)).toBe(true);
    });
  });
});
