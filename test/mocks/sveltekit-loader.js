/**
 * Custom ES module loader for mocking SvelteKit modules in tests
 */

// Mock implementations
const mocks = {
  '$app/environment': `
    export const browser = false;
    export const dev = false;
    export const building = false;
    export const version = '1.0.0';
  `,
  '$app/stores': `
    export const page = {
      subscribe: (fn) => {
        fn({
          url: new URL('http://localhost:3000'),
          params: {},
          route: { id: '/' },
          status: 200,
          error: null,
          data: {}
        });
        return () => {};
      }
    };
    export const navigating = {
      subscribe: (fn) => {
        fn(null);
        return () => {};
      }
    };
    export const updated = {
      subscribe: (fn) => {
        fn(false);
        return () => {};
      }
    };
  `,
  '$app/navigation': `
    export const goto = async (url) => {
      console.log(\`Mock navigation to: \${url}\`);
    };
    export const invalidate = async () => {
      console.log('Mock invalidate');
    };
    export const invalidateAll = async () => {
      console.log('Mock invalidateAll');
    };
    export const preloadData = async () => {
      console.log('Mock preloadData');
    };
    export const preloadCode = async () => {
      console.log('Mock preloadCode');
    };
  `
};

export async function resolve(specifier, context, next) {
  if (mocks[specifier]) {
    return {
      url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
      shortCircuit: true
    };
  }
  return next(specifier, context);
}