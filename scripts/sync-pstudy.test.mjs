import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPstudySource } from './sync-pstudy.mjs';

describe('findPstudySource', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sync-pstudy-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('サブモジュール pstudy-dict の services フォルダを返す', () => {
    const services = join(root, 'pstudy-dict', 'src', 'app', 'services');
    mkdirSync(services, { recursive: true });
    expect(findPstudySource(root)).toBe(services);
  });

  it('隣のフォルダ（../pstudy-dict）は見ない', () => {
    const sibling = join(root, 'sibling');
    mkdirSync(join(root, 'pstudy-dict', 'src', 'app', 'services'), { recursive: true });
    mkdirSync(sibling);
    expect(findPstudySource(sibling)).toBeNull();
  });

  it('サブモジュールが取得されていなければ null を返す', () => {
    mkdirSync(join(root, 'pstudy-dict'));
    expect(findPstudySource(root)).toBeNull();
  });
});
