import buble from 'rollup-plugin-buble';
import pkg from './package.json';

export default {
	input: './src/index.js',
	plugins: [ buble({ objectAssign: 'Object.assign' }) ],
	external: id => !id.startsWith('.') && !id.startsWith('/'),
	output: [
		{ file: pkg.main, format: 'cjs', sourcemap: true },
		{ file: pkg.module, format: 'esm', sourcemap: true },
	]
};
