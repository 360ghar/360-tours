# Testing Strategy

This document defines the testing approach, tools, and structure for the 360 Tours Platform.

## Testing stack

| Layer | Tool | Config |
|-------|------|--------|
| Unit tests | Vitest + React Testing Library | `vitest.config.ts` |
| Component tests | Vitest + React Testing Library | `src/test/setup.ts` |
| Store tests | Vitest | `src/test/stores/` |
| E2E tests | Playwright | `playwright.config.ts` |
| Test utilities | Custom test-utils | `src/test/test-utils.tsx` |

## Unit and component tests

Located in `src/test/`.

### Structure

```
src/test/
  setup.ts              # Global test setup (DOM mocks, providers)
  test-utils.tsx         # Custom render with providers (React Query, Router)
  components/
    Badge.test.tsx       # UI component tests
    Card.test.tsx
    Input.test.tsx
  stores/
    authStore.test.ts    # Zustand store tests
```

### Test utilities

`test-utils.tsx` provides a custom `render()` function that wraps components with:
- React Query provider (with test-specific query client)
- Router context
- Theme provider

### Writing component tests

- Test user-visible behavior, not implementation details.
- Use `screen.getByRole`, `screen.getByText` for queries.
- Prefer `userEvent` over `fireEvent` for user interactions.
- Mock API calls at the network layer, not at the module level.

### Writing store tests

- Test store actions and their effects on state.
- Reset store state between tests.
- Mock external dependencies (API calls, Supabase auth).

## E2E tests

Located in `e2e/`.

### Structure

```
e2e/
  auth.setup.ts          # Authentication setup (shared auth state)
  tours.spec.ts          # Tour CRUD flows
  tour-create.spec.ts    # Tour creation flow
  tour-edit.spec.ts      # Tour editing flow
  public-viewer.spec.ts  # Public viewing experience
  ai-features.spec.ts    # AI feature flows
  fixtures/              # Test data and fixtures
  page-objects/          # Page object models
```

### Page objects

E2E tests use the Page Object pattern to encapsulate page-specific selectors and actions, keeping test files focused on behavior.

### Auth setup

`auth.setup.ts` handles authentication state that is shared across test files, avoiding re-login for each test.

### Running E2E tests

```bash
# Run all E2E tests
npx playwright test

# Run specific test file
npx playwright test e2e/tours.spec.ts

# Run with UI mode
npx playwright test --ui

# Run headed (visible browser)
npx playwright test --headed
```

## Coverage expectations

| Area | Target |
|------|--------|
| UI components | 80%+ (critical paths) |
| Store logic | 90%+ |
| Utility functions | 95%+ |
| API modules | Integration tested via E2E |
| E2E core flows | All MVP acceptance gates |

## CI integration

- Unit and component tests run on every PR.
- E2E tests run on merge to `main` and before production deployment.
- Test failures block merge/deploy.

**Document Links**:
- [Security](security.md) → Next
- [Technical Index](README.md) ← Back
