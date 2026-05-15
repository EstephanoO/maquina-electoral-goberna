/**
 * Ambient module declaration for 'bun:test'.
 *
 * The project uses jest-expo as its test runner. This declaration prevents
 * TypeScript errors for test files that import from 'bun:test'. At runtime,
 * jest.config.js maps 'bun:test' to __mocks__/bun-test.js (jest globals).
 */
declare module 'bun:test' {
  export const expect: typeof globalThis.expect;
  export const describe: typeof globalThis.describe;
  export const it: typeof globalThis.it;
  export const test: typeof globalThis.test;
  export const beforeEach: typeof globalThis.beforeEach;
  export const afterEach: typeof globalThis.afterEach;
  export const beforeAll: typeof globalThis.beforeAll;
  export const afterAll: typeof globalThis.afterAll;

  type MockFn<T extends (...args: unknown[]) => unknown> = jest.MockedFunction<T>;

  export function mock<T extends (...args: unknown[]) => unknown>(fn?: T): MockFn<T>;
  export namespace mock {
    function module(specifier: string, factory: () => unknown): void;
    function restore(): void;
  }
}
