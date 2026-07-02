# 360 Viewer

A React + TypeScript app for creating and publishing 360 virtual tours.

## Core Product Focus

This codebase is currently optimized for:
- AI-assisted tour generation (scene analysis, hotspot suggestions, draft generation)
- Reliable tour creation/editing for scenes and hotspots
- Fast public tour viewing
- Easy tour sharing and iframe embedding

Secondary modules (advanced analytics, floor plans, branding customization) remain in the repository but are not the primary focus.

## Tech Stack

- React 19 + TypeScript
- Vite
- TanStack Query
- Zustand
- Tailwind CSS + Radix UI
- Playwright + Vitest

## Getting Started

1. Install dependencies:
```bash
npm ci
```

2. Configure environment:
```bash
cp .env.example .env
```

3. Start the dev server:
```bash
npm run dev
```

## Common Commands

```bash
npm run dev            # Start app
npm run build          # Production build
npm run preview        # Preview build
npm run lint           # ESLint
npm run format         # Prettier
npm run test:run       # Vitest (single run)
npm run test:e2e       # Playwright
```

## Core Routes

- `/tours/create` or `/tours/new`: create a tour (manual + AI wizard)
- `/tours/:id/edit`: tour editor
- `/view/:id` (also `/tour/:id`): public tour viewer
- `/embed/:id`: embed-safe viewer

## Documentation

See docs index: `docs/README.md`

## Release Process

This project follows [Semantic Versioning](https://semver.org/).

1. Update `version` in `package.json`
2. Update `CHANGELOG.md` (create it if it doesn't exist) with the changes
3. Create a git tag: `git tag -a v<X.Y.Z> -m "Release vX.Y.Z"`
4. Push the tag: `git push origin v<X.Y.Z>`
5. The CI pipeline builds and validates before any deploy

### Versioning Convention
- **Major (X)**: Breaking changes to the public embed API or data contracts
- **Minor (Y)**: New features, backward-compatible
- **Patch (Z)**: Bug fixes, security patches
