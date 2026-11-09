import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const cache = new Map();

export async function loadPrompt(name) {
  if (!cache.has(name)) {
    const text = await fs.promises.readFile(
      path.join(config.paths.promptsDir, `${name}.md`),
      'utf8'
    );
    cache.set(name, text);
  }
  return cache.get(name);
}

export const loadSummaryPrompt = () => loadPrompt('summary');
