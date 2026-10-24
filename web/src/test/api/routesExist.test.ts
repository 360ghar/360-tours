import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every route the API clients call must exist in the backend OpenAPI document with
 * the same method. A removed route (reel, collaboration, public floor-plan fallback)
 * fails here instead of returning 404 for a user.
 */
const API_DIR = join(__dirname, '..', '..', 'api');
const SPEC = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'openapi', 'openapi.json'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};

const shape = (path: string) => path.replace(/\{[^}]+\}/g, '{}');

const specRoutes = new Map<string, Set<string>>();
for (const [path, ops] of Object.entries(SPEC.paths)) {
  specRoutes.set(shape(path), new Set(Object.keys(ops)));
}

interface Call {
  file: string;
  method: string;
  path: string;
}

function collectCalls(): Call[] {
  const calls: Call[] = [];
  const pattern = /apiClient\s*\.\s*(get|post|put|patch|delete)\b[^(]*\(\s*([`'"])([^`'"]+)\2/g;
  for (const file of readdirSync(API_DIR).filter(f => f.endsWith('.ts'))) {
    const source = readFileSync(join(API_DIR, file), 'utf8');
    for (const match of source.matchAll(pattern)) {
      const path = match[3].replace(/\$\{[^}]+\}/g, '{}');
      calls.push({ file, method: match[1], path: `/api/v1${path}` });
    }
  }
  return calls;
}

describe('api clients call routes the backend defines', () => {
  const calls = collectCalls();

  it('finds the calls', () => {
    expect(calls.length).toBeGreaterThan(30);
  });

  it.each(calls.map(c => [`${c.method.toUpperCase()} ${c.path} (${c.file})`, c] as const))(
    '%s',
    (_label, call) => {
      const methods = specRoutes.get(shape(call.path));
      expect(methods, `${call.path} is not in openapi/openapi.json`).toBeDefined();
      expect(methods?.has(call.method), `${call.method} ${call.path} is not allowed`).toBe(true);
    }
  );

  it('calls none of the removed routes', () => {
    const paths = calls.map(c => c.path);
    expect(paths.some(p => /reel|collaborat|activities/.test(p))).toBe(false);
    expect(paths.some(p => /\/public\/tours\/\{\}\/floor-plans/.test(p))).toBe(false);
    expect(calls.some(c => c.method === 'put' && /\/tours\/\{\}$|\/scenes\/\{\}$/.test(c.path))).toBe(false);
  });
});
