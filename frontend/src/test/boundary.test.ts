import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Frontend Boundary & Static Content Audit Tests', () => {
  const currentFile = fileURLToPath(import.meta.url);
  const srcDir = path.resolve(path.dirname(currentFile), '..');

  function getFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name === 'test' || entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getFiles(fullPath));
      } else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const allSourceFiles = getFiles(srcDir);

  it('1. Live mode modules do not import Demo fixtures or Demo data', () => {
    const liveFiles = allSourceFiles.filter(f => f.includes(`${path.sep}modes${path.sep}live`));
    for (const file of liveFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"].*demoFixtures['"]/);
      expect(content).not.toMatch(/from ['"].*DemoDataProvider['"]/);
    }
  });

  it('2. Demo mode modules do not import the API client', () => {
    const demoFiles = allSourceFiles.filter(f => f.includes(`${path.sep}modes${path.sep}demo`));
    for (const file of demoFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"].*api\/client['"]/);
      expect(content).not.toMatch(/apiClient/);
    }
  });

  it('3. No frontend source imports dashboard mock data or python engine modules', () => {
    for (const file of allSourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toContain('dashboard/data.js');
      expect(content).not.toContain('dashboard/review_data.js');
      expect(content).not.toContain('mep_ai');
      expect(content).not.toContain('fitz');
      expect(content).not.toContain('ultralytics');
    }
  });

  it('4. No known curated extraction values appear hardcoded in frontend source', () => {
    for (const file of allSourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toContain('31.699');
      expect(content).not.toContain('SCALE_VERIFIED');
      expect(content).not.toContain('CD4ACA');
    }
  });
});
