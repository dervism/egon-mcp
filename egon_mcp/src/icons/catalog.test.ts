import { describe, expect, it } from 'vitest';
import { DEFAULT_ICON_NAMES, IconCatalog } from './catalog.js';

describe('IconCatalog', () => {
  const catalog = IconCatalog.builtIn();

  it('lists every built-in Egon icon', () => {
    expect(catalog.names().length).toBeGreaterThan(100);
    expect(catalog.names()).toContain('Person');
    expect(catalog.names()).toContain('Document');
  });

  it('looks up icons case-insensitively and returns the canonical name', () => {
    expect(catalog.get('person')?.name).toBe('Person');
    expect(catalog.get('PICTURE-AS-pdf')?.name).toBe('Picture-as-PDF');
    expect(catalog.get('no such icon')).toBeUndefined();
  });

  it('finds icons by keyword, ranking exact name matches first', () => {
    const results = catalog.search('car');
    expect(results[0]?.name).toBe('Car');
    expect(results.map((icon) => icon.name)).toContain('Truck');
    expect(catalog.search('')).toEqual([]);
  });

  it('matches multi-word queries against names and keywords', () => {
    const names = catalog.search('credit card').map((icon) => icon.name);
    expect(names[0]).toBe('Credit-Card');
  });

  it('knows the default icon set Egon starts with', () => {
    expect(DEFAULT_ICON_NAMES).toEqual({
      actors: ['Person', 'Group', 'System'],
      workObjects: ['Document', 'Folder', 'Call', 'Email', 'Conversation', 'Info'],
    });
    const iconSet = catalog.defaultIconSet();
    expect(Object.keys(iconSet.actors)).toEqual(DEFAULT_ICON_NAMES.actors);
    expect(iconSet.actors['Person']).toMatch(/^<svg/);
    expect(iconSet.name).toBe('default');
  });
});
