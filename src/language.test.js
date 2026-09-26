import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMiniAppUrl } from './language.js';

test('buildMiniAppUrl preserves existing query params and adds selected language', () => {
  const url = buildMiniAppUrl('https://example.com/app?foo=bar', 'fa');
  assert.equal(url, 'https://example.com/app?foo=bar&lang=fa');
});

test('buildMiniAppUrl falls back to default language when code is missing', () => {
  const url = buildMiniAppUrl('https://example.com/app', undefined);
  assert.equal(url, 'https://example.com/app?lang=fa');
});
