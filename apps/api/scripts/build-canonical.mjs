// Uses the already locked root esbuild dependency and root runtime packages.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const forbidden = /^(?:@tanstack\/|react(?:\/|$)|react-dom(?:\/|$)|@\/.*\.functions(?:\.ts)?$)/;
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/modules/identity/http-api-identity.server.ts'],
  outfile: 'apps/api/dist/canonical.cjs',
  platform: 'node', target: 'node24', format: 'cjs',
  bundle: true, packages: 'external', tsconfig: 'tsconfig.json', metafile: true,
  plugins: [{name:'api-boundary', setup(builder) {
    builder.onResolve({filter: /.*/}, args => {
      if (forbidden.test(args.path) || /\.functions(?:\.ts)?$/.test(args.path))
        return {errors:[{text:'Forbidden API domain dependency: ' + args.path}]};
    });
  }}],
});
for (const path of Object.keys(result.metafile.inputs)) {
  if (/\.functions\.tsx?$|\/routes\//.test(path)) throw new Error('Forbidden backend dependency: ' + path);
}
