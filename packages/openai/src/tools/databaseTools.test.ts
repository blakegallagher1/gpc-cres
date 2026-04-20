import { describe, expect, it } from "vitest";

import { extractReferencedTables } from "./databaseTools.js";

describe("extractReferencedTables", () => {
  it("ignores line comments when collecting table references", () => {
    const sql = `
      -- querying from tables for deal analytics
      select *
      from deals
      join parcels on parcels.deal_id = deals.id
    `;

    expect(extractReferencedTables(sql)).toEqual(["deals", "parcels"]);
  });

  it("ignores block comments when collecting table references", () => {
    const sql = `
      /*
        join tables should not be treated as executable SQL
      */
      with scoped as (
        select id from deals
      )
      select *
      from scoped
      join tasks on tasks.deal_id = scoped.id
    `;

    expect(extractReferencedTables(sql)).toEqual(["deals", "scoped", "tasks"]);
  });
});
