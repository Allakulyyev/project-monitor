// Конфиг сборки: бандлит src/extension.ts в один CommonJS-файл dist/extension.js.
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Собирает (и при --watch отслеживает) расширение в один файл.
async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile: 'dist/extension.js',
    // 'vscode' предоставляется средой выполнения, его не бандлим.
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
    logLevel: 'info'
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
