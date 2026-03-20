# AGENTS.md — apps/web (Frontend Application Layer)

> This AGENTS.md scopes to `apps/web/` and all subdirectories.
> It supplements (does not replace) the root AGENTS.md.

## Layer Position: L4

This is the Next.js frontend application. It sits at Layer 4 — the highest application layer.

## Strict Rules

- **No packages/ may import from apps/web**: This is a leaf consumer. If packages/ needs something from here, it must be extracted into a shared package first.
- **Communicate with backend via HTTP only**: No direct Python imports or cross-runtime calls.
- **Follow existing design system**: Do not introduce new colors, fonts, or spacing scales without approval. Use the project's design tokens from the existing component library.
- **Prefer CSS variables over inline styles**: New components must use the project's design tokens.

## Next.js Conventions

- Pages use default exports (the only exception to the named-export rule)
- Server components by default; add `'use client'` only when needed
- API routes go in `app/api/`
- Static assets in `public/`
- Shared components in `components/`

## Performance

- Lazy load heavy components with `dynamic()` from `next/dynamic`
- Use `Image` from `next/image` for all images
- Avoid N+1 API calls — batch requests where possible

## Testing

- Component tests with Vitest + React Testing Library
- E2E tests with Playwright in `e2e/`
- Visual regression: snapshot test any component that renders financial data

## Bloomberg-Style UI Notes

- Dense, information-rich layouts — minimize whitespace
- Data tables are the primary UI pattern, not cards
- Color coding follows financial convention: green for positive, red for negative
- Keyboard navigation must work for power users
