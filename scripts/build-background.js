import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['src/background/index.ts'],
  bundle: true,
  outfile: 'dist/background.js',
  format: 'iife',
  target: ['firefox115'],
});

if (watch) {
  await ctx.watch();
  console.log('Watching background script...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
