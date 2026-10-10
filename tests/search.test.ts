import { describe, expect, test } from 'bun:test';
import { normalize, queryTerms, rankMatches, searchText } from '../src/lib/search';

const project = (name: string, description: string, slug = normalize(name).replaceAll(' ', '-')) => ({
  name,
  data: { name: normalize(name), text: searchText(name, description, 'Application', slug) },
});

const search = (query: string, list: ReturnType<typeof project>[]) =>
  rankMatches(list, queryTerms(query), (p) => p.data).map((p) => p.name);

describe('normalize', () => {
  test('folds accents and punctuation', () => {
    expect(normalize('Déjà Dup')).toBe('deja dup');
    expect(normalize('LÖVE')).toBe('love');
    expect(normalize('  llama.cpp / yt-dlp ')).toBe('llama cpp yt dlp');
  });
});

describe('rankMatches', () => {
  const list = [
    project('Nixpkgs', 'The Nix packages collection for Linux and macOS.'),
    project('systemd', 'System and service manager for Linux.'),
    project('Asahi Linux', 'Linux on Apple Silicon Macs.'),
    project('Linux man-pages', 'Manual pages for the Linux kernel and C library.'),
    project('Linux kernel', 'The Linux operating system kernel.'),
  ];

  test('the named project comes before projects that mention it', () => {
    expect(search('linux kernel', list)[0]).toBe('Linux kernel');
    expect(search('kernel', list)[0]).toBe('Linux kernel');
  });

  test('name prefix, then name word, then description only; shorter name breaks ties', () => {
    expect(search('linux', list)).toEqual(['Linux kernel', 'Linux man-pages', 'Asahi Linux', 'Nixpkgs', 'systemd']);
  });

  test('exact name wins over a longer name with the same prefix', () => {
    const go = [project('Gogs', 'Painless self-hosted Git service written in Go.'), project('Go', 'The Go programming language.')];
    expect(search('go', go)).toEqual(['Go', 'Gogs']);
  });

  test('punctuation and spacing in names do not matter', () => {
    const node = [project('Deno', 'Runtime compatible with Node.js.'), project('Node.js', 'JavaScript runtime.', 'nodejs')];
    expect(search('nodejs', node)[0]).toBe('Node.js');
    expect(search('node js', node)[0]).toBe('Node.js');
    expect(search('deja', [project('Déjà Dup', 'Simple backup tool.')])).toEqual(['Déjà Dup']);
  });

  test('equal scores and names keep list order', () => {
    expect(search('tool', [project('Beta', 'A tool.'), project('Alfa', 'A tool.')])).toEqual(['Beta', 'Alfa']);
  });

  test('every term must match somewhere', () => {
    expect(search('linux zzz', list)).toEqual([]);
  });
});
