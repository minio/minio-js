import dotenv from 'dotenv';
import sourceMapSupport from 'source-map-support';
import esbuildRegister from 'esbuild-register/dist/node';

dotenv.config();
sourceMapSupport.install();

esbuildRegister.register({
  target: 'node16',
  format: 'cjs',
});
