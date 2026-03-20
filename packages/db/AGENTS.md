# AGENTS.md — packages/db (Database Layer)

> This AGENTS.md scopes to `packages/db/` and all subdirectories.
> It supplements (does not replace) the root AGENTS.md.

## Layer Position: L1

This package is the database access layer. It sits at Layer 1 in the dependency hierarchy.

## Strict Rules

- **NEVER import from application or domain packages**: No imports from `apps/web`,
  `@entitlement-os/openai`, `@entitlement-os/evidence`, `@entitlement-os/artifacts`,
  or `@gpc/server`. This package exposes Prisma and DB access only.
- **Dependency surface**: Match `package.json` — Prisma, `pg`, and Node types. Do not add
  imports that pull UI or agent runtime into the DB layer.
- **Always use parameterized queries**: Never interpolate user input into SQL strings.
- **Every migration needs a down migration**: All files in `migrations/` must be reversible.
- **Never modify applied migrations**: Once a migration has been applied to production, create a new migration instead. Files in `migrations/` that have been deployed are immutable.

## Prisma Conventions

- Schema changes go in `prisma/schema.prisma`
- Run `pnpm db:generate` after schema changes to regenerate the client
- Run `pnpm db:migrate` to create new migrations
- Name migrations descriptively: `add_parcel_zoning_lookup`, not `migration_001`

## Testing

- Integration tests must use a test database, never production
- Mock the Prisma client in unit tests for packages that depend on `packages/db`
- All new queries need test coverage
