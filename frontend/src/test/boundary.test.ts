import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Frontend boundary & static content audit', () => {
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

  it('workspace code never imports demo fixtures or demo data', () => {
    const workspaceFiles = allSourceFiles.filter((f) => f.includes(`${path.sep}workspace`));
    expect(workspaceFiles.length).toBeGreaterThan(0);
    for (const file of workspaceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"].*demoFixtures['"]/);
      expect(content).not.toMatch(/from ['"].*DemoDataProvider['"]/);
    }
  });

  it('demo mode modules do not import the API client', () => {
    const demoFiles = allSourceFiles.filter((f) => f.includes(`${path.sep}modes${path.sep}demo`));
    for (const file of demoFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"].*api\/client['"]/);
      expect(content).not.toMatch(/apiClient/);
    }
  });

  it('no legacy project/run/job surface survives anywhere', () => {
    const forbidden = ['/api/v1', 'useAnalysisWorkflow', 'AskTheDrawingDrawer', 'RunViewer', 'LiveApp'];
    for (const file of allSourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const token of forbidden) {
        expect(content, `${token} in ${path.basename(file)}`).not.toContain(token);
      }
    }
  });

  it('no legacy model branding or detectors survive in UI copy', () => {
    for (const file of allSourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      // Story mode may discuss generic detectors historically; product UI must not.
      if (file.includes(`${path.sep}modes${path.sep}story`)) continue;
      expect(content, `YOLO in ${path.basename(file)}`).not.toMatch(/YOLO/i);
      expect(content, `RT-DETR in ${path.basename(file)}`).not.toMatch(/RT-?DETR/i);
      expect(content, `MEP Design AI in ${path.basename(file)}`).not.toContain('MEP Design AI');
    }
  });

  it('no secrets or storage-based keys in frontend source', () => {
    for (const file of allSourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/localStorage\.setItem.*key/i);
      expect(content).not.toMatch(/sessionStorage\.setItem.*key/i);
      expect(content).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    }
  });

  it('no known curated extraction values appear hardcoded in frontend source', () => {
    for (const file of allSourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toContain('31.699');
      expect(content).not.toContain('SCALE_VERIFIED');
      expect(content).not.toContain('CD4ACA');
    }
  });
});
