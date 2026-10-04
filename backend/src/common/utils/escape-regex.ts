/** Escape dei caratteri speciali per usare input utente in una RegExp (ricerca case-insensitive su Mongo). */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
