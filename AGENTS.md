# Repository Guidelines

## Project Structure & Module Organization

- `src/`: React + TypeScript app code
  - `api/` API clients (Axios) and request helpers
  - `components/` shared UI components (Radix UI/Tailwind)
  - `pages/` route-level screens (React Router)
  - `stores/` Zustand state stores (e.g., `authStore.ts`)
  - `hooks/`, `utils/`, `lib/`, `types/`, `assets/`, `test/`
- `public/`: static assets copied into the build
- `e2e/`: Playwright end-to-end specs (`*.spec.ts`)
- `docs/`: product/technical notes
- `dist/`: production build output (generated)

## Build, Test, and Development Commands

- `npm ci`: install dependencies from `package-lock.json`
- `cp .env.example .env`: create local config (only `VITE_*` vars are exposed to the client)
- `npm run dev`: start the Vite dev server (see `vite.config.ts` for port and `/api` proxy)
- `npm run build`: run TypeScript build + Vite bundle to `dist/`
- `npm run preview`: serve the production bundle locally
- `npm run lint`: run ESLint
- `npm run format`: run Prettier on `src/**/*.{ts,tsx,css}`

## Testing Guidelines

- Unit/integration: Vitest + Testing Library
  - `npm test` (watch), `npm run test:run`, `npm run test:coverage`
  - Name tests `*.test.ts(x)` or `*.spec.ts(x)` under `src/`
- E2E: Playwright
  - `npm run test:e2e` (starts a dev server via `playwright.config.ts`)
  - Keep specs in `e2e/*.spec.ts`

## Coding Style & Naming Conventions

- Formatting is enforced by Prettier (`tabWidth: 2`, `singleQuote: true`, `semi: true`).
- Prefer the `@/` alias for imports (maps to `src/`), e.g. `import { cn } from '@/utils';`.
- Components: `PascalCase.tsx`; hooks: `useSomething.ts`; stores: `somethingStore.ts`.

## Commit & Pull Request Guidelines

- Commit messages in this repo are short, imperative sentences (e.g., “Update UI components and styling”); keep the same style and add a scope when helpful (`Auth: …`).
- PRs should include: a clear summary, linked issue(s), screenshots for UI changes, and quick test notes (commands run and key flows verified).

## Security & Configuration Tips

- Never commit `.env` files or secrets; update `.env.example` when introducing new `VITE_*` config.
- Auth/session lifecycle must be managed through Supabase SDK (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`); avoid custom token refresh/storage implementations.
