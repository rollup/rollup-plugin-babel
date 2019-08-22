import { transformSync } from '@babel/core';
import { INLINE, RUNTIME, EXTERNAL, BUNDLED } from './constants.js';
import { addBabelPlugin } from './utils.js';

const MODULE_ERROR =
	'Rollup requires that your Babel configuration keeps ES6 module syntax intact. ' +
	'Unfortunately it looks like your configuration specifies a module transformer ' +
	'to replace ES6 modules with another module format. To continue you have to disable it.' +
	'\n\n' +
	"Most commonly it's a CommonJS transform added by @babel/preset-env - " +
	'in such case you should disable it by adding `modules: false` option to that preset ' +
	'(described in more detail here - https://github.com/rollup/rollup-plugin-babel#modules ).';

const UNEXPECTED_ERROR =
	'An unexpected situation arose. Please raise an issue at ' +
	'https://github.com/rollup/rollup-plugin-babel/issues. Thanks!';

function fallbackClassTransform() {
	return {
		visitor: {
			ClassDeclaration(path, state) {
				path.replaceWith(state.file.addHelper('inherits'));
			},
		},
	};
}

const PREFLIGHT_INPUT = 'class Foo extends Bar {};\nexport default Foo;';

const mismatchError = (actual, expected, filename) =>
	`You have declared using "${expected}" babelHelpers, but transforming ${filename} resulted in "${actual}. Please check your configuration."`;

export default function preflightCheck(ctx, babelHelpers, transformOptions) {
	let check = transformSync(PREFLIGHT_INPUT, transformOptions).code;

	if (~check.indexOf('class ')) {
		check = transformSync(PREFLIGHT_INPUT, addBabelPlugin(transformOptions, fallbackClassTransform)).code;
	}

	if (
		!~check.indexOf('export default') &&
		!~check.indexOf('export default Foo') &&
		!~check.indexOf('export { Foo as default }')
	) {
		ctx.error(MODULE_ERROR);
	}

	if (check.match(/\/helpers\/(esm\/)?inherits/)) {
		if (babelHelpers === RUNTIME) {
			return;
		}
		ctx.error(mismatchError(RUNTIME, babelHelpers, transformOptions.filename));
	}

	if (~check.indexOf('babelHelpers.inherits')) {
		if (babelHelpers === EXTERNAL) {
			return;
		}
		ctx.error(mismatchError(EXTERNAL, babelHelpers, transformOptions.filename));
	}

	if (~check.indexOf('function _inherits')) {
		if (babelHelpers === INLINE || babelHelpers === BUNDLED) {
			return;
		}
		ctx.error(mismatchError(INLINE, babelHelpers, transformOptions.filename));
	}

	ctx.error(UNEXPECTED_ERROR);
}
