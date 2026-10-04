/**
 * Setup globale degli unit test (vitest + jsdom).
 *
 * jsdom non implementa window.matchMedia: i componenti che lo usano
 * (pdf-search, drawer, platform-ui, theme) facevano fallire intere suite
 * con "matchMedia is not a function". Il polyfill risponde "nessun match"
 * e accetta i listener; i test che devono simulare una media query la
 * sovrascrivono localmente.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
