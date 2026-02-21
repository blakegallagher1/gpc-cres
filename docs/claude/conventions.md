# Conventions

## Code Style

- **TypeScript**: ESLint 9 + typescript-eslint. Strict mode. Components PascalCase, hooks `use*` prefix.
- **Tools**: snake_case names (e.g., `get_deal_context`). Functions camelCase. Constants UPPER_SNAKE_CASE.
- **Commits**: Short imperative with optional scope: `tools: add flood lookup`, `ui: rewrite ParcelTable`
- **Error handling**: Tool execute functions return `JSON.stringify({ error: "..." })` on failure. API routes use try/catch returning `NextResponse.json({ error }, { status })`.

## File Naming Conventions

- React components: `PascalCase.tsx`
- Utilities/helpers: `camelCase.ts`
- API routes: `route.ts` (Next.js App Router pattern)
- Tests: `*.test.ts` or `*.test.tsx`

## Multi-Tenant Scoping Patterns

All DB queries MUST scope by `orgId`:

```typescript
// Good
const deal = await prisma.deal.findFirstOrThrow({
  where: { id, orgId }
});

// Bad - missing orgId check
const deal = await prisma.deal.findUnique({
  where: { id }
});
```

## Agent Tool Patterns

- Tools are wired in `createConfiguredCoordinator()`, NOT on module-level agent exports
- Use Zod `.nullable()` (not `.optional()`) for tool parameters
- Never use `.url()` or `.email()` Zod validators (OpenAI rejects `format:` constraints)
- Tool execute functions return `JSON.stringify({ error })` on failure

## Event Dispatch Patterns

- Always use `.catch(() => {})` on `dispatchEvent()` — fire-and-forget
- Import `@/lib/automation/handlers` at route top to ensure handler registration
- Read existing record state before update when dispatch depends on detecting a change
- Never let event dispatch fail an API response
