import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(appDir, '.next/server/app/index.html'), 'utf8');

const expected = [
    'Item awaited created 2024-01-01T00:00:00.000Z',
    'Item streamed created 2024-01-01T00:00:00.000Z',
    'Item admin created 2024-01-01T00:00:00.000Z',
];

// React may split adjacent text nodes with comments
const text = html.replace(/<!-- -->/g, '');
const missing = expected.filter((value) => !text.includes(value));

if (missing.length > 0) {
    console.error('Prerendered page is missing:', missing);
    process.exit(1);
}
console.log('Prerendered page contains the hydrated queries');
