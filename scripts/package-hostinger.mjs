import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const release = join(root, 'release');
const publicHtml = join(release, 'public_html');
const privateRoot = join(release, 'tidemark-private');

await rm(release, { recursive: true, force: true });
await mkdir(publicHtml, { recursive: true });
await cp(join(root, 'dist'), publicHtml, { recursive: true });
await cp(join(root, 'api'), join(publicHtml, 'api'), { recursive: true });
await cp(join(root, 'hostinger', 'public.htaccess'), join(publicHtml, '.htaccess'));
await cp(join(root, 'hostinger', 'public.user.ini'), join(publicHtml, '.user.ini'));
await mkdir(join(privateRoot, 'proofs'), { recursive: true });
await cp(join(root, 'hostinger', 'config.example.php'), join(privateRoot, 'config.example.php'));
await cp(join(root, 'hostinger', 'private.htaccess'), join(privateRoot, '.htaccess'));
await cp(join(root, 'database'), join(release, 'database'), { recursive: true });
await cp(join(root, 'hostinger', 'README.txt'), join(release, 'README.txt'));

console.log(`Hostinger release ready at ${release}`);
