import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kk } from '../src/i18n-kk';
import { price } from '../src/api';

const src = join(__dirname, '../src');
const files = [
  'App.tsx',
  'components.tsx',
  'clients.tsx',
  'site.tsx',
  'pages/Home.tsx',
  'pages/Book.tsx',
  'pages/Visit.tsx',
  'pages/Gift.tsx',
  'pages/Rate.tsx',
];
/** Every literal passed to t('…') on the public pages, including multi-line calls. */
const keys = files.flatMap((file) =>
  [...readFileSync(join(src, file), 'utf8').matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)].map(
    (m) => m[1],
  ),
);

describe('Kazakh version', () => {
  it('has a translation for every text of the public site', () => {
    expect(keys.length).toBeGreaterThan(100);
    expect(keys.filter((k) => !(k in kk))).toEqual([]);
  });
  it('keeps the {placeholders} of each text', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [ru, text] of Object.entries(kk)) expect(vars(text), ru).toEqual(vars(ru));
  });
  it('translates every service of the price list', () => {
    const sql = readFileSync(
      join(__dirname, '../../api/prisma/migrations/20261008020000_price_list/migration.sql'),
      'utf8',
    );
    const services = [...sql.matchAll(/'(?:Мужской|Женский) зал', '([^']+)', '([^']*)'/g)];
    expect(services.length).toBe(29);
    for (const [, name, description] of services) {
      expect(kk[name], name).toBeTruthy();
      if (description) expect(kk[description], description).toBeTruthy();
    }
  });
  it('writes «от» prices the Kazakh way', () => {
    const s = { priceMinor: 250000, priceFrom: true };
    // Intl separates thousands and the sign with no-break spaces.
    const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');
    expect(plain(price(s, 'KZT'))).toBe('от 2 500 ₸');
    expect(plain(price(s, 'KZT', 'kk'))).toBe('2 500 ₸ бастап');
    expect(plain(price({ ...s, priceFrom: false }, 'KZT', 'kk'))).toBe('2 500 ₸');
  });
});
