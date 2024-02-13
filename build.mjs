import esbuild from 'esbuild';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'url';

// Helper function to get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));

async function build(module) {
  console.log(`Building for ${module}...`);

  const outDir = module === 'cjs' ? './dist/main/' : './dist/esm/';
  const format = module === 'cjs' ? 'cjs' : 'esm';
  const extension = module === 'cjs' ? '.js' : '.mjs';

  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/minio.js')],
    outdir: outDir,
    platform: 'node',
    target: 'node16',
    format: format,
    bundle: true,
    sourcemap: true,
    external: Object.keys(pkg.dependencies || {}),
    define: {
      'process.env.MINIO_JS_PACKAGE_VERSION': JSON.stringify(pkg.version),
    },
    plugins: [
      // Add any esbuild plugins you need here
    ],
  });
}

async function main() {
  await fs.rm('dist', { recursive: true, force: true });

  // Build for both CommonJS and ES Module formats
  await Promise.all([
    build('cjs'),
    build('esm'),
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
