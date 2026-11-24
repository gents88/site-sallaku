import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Gruppi di robots.txt: elenco di user-agent con le loro regole (RFC 9309: più User-agent di fila condividono le regole). */
function parse(txt: string): { agents: string[]; rules: string[] }[] {
  const groups: { agents: string[]; rules: string[] }[] = [];
  let last: 'agent' | 'rule' | null = null;
  for (const raw of txt.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      if (last !== 'agent') groups.push({ agents: [], rules: [] });
      groups[groups.length - 1].agents.push(value);
      last = 'agent';
    } else if (key === 'allow' || key === 'disallow') {
      groups[groups.length - 1]?.rules.push(`${key}: ${value}`);
      last = 'rule';
    }
  }
  return groups;
}

describe('robots.txt', () => {
  const groups = parse(readFileSync(resolve(process.cwd(), 'public/robots.txt'), 'utf8'));
  const groupOf = (agent: string) => groups.find(g => g.agents.some(a => a.toLowerCase() === agent.toLowerCase()));

  // Questi bot decidono se il sito compare nelle risposte di ChatGPT, Perplexity e Claude: non vanno mai bloccati.
  it.each(['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'Claude-SearchBot', 'Claude-User'])(
    '%s può leggere il sito',
    agent => {
      const g = groupOf(agent);
      expect(g, `${agent}: manca il gruppo`).toBeTruthy();
      expect(g!.rules).toContain('allow: /');
      expect(g!.rules).not.toContain('disallow: /');
    },
  );

  // Un gruppo con un nome proprio ignora quello di "*": le aree riservate devono essere ripetute (qui sono lo stesso gruppo).
  it('i bot AI di ricerca non possono entrare nel pannello di amministrazione', () => {
    for (const agent of ['OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot']) {
      expect(groupOf(agent)!.rules, agent).toContain('disallow: /dashboard/');
    }
  });

  it('indica la sitemap', () => {
    expect(readFileSync(resolve(process.cwd(), 'public/robots.txt'), 'utf8')).toMatch(/^Sitemap: https:\/\/gentsallaku\.it\/sitemap\.xml$/m);
  });
});
