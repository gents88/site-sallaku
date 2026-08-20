import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // I primi test di ogni file di componente pagano la compilazione del
    // componente stesso (template + stili): con il default di 5s finivano in
    // timeout in modo intermittente, senza che nulla fosse rotto.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
