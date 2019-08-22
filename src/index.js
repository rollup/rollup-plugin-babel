import * as babel from '@babel/core';
import { createFilter } from 'rollup-pluginutils';
import preflightCheck from './preflightCheck.js';
import bundledHelpersPlugin from './bundledHelpersPlugin.js';
import { addBabelPlugin, escapeRegExpCharacters } from './utils.js';
import { RUNTIME, EXTERNAL, BUNDLED, INLINE, HELPERS } from './constants.js';

const unpackOptions = ({
	extensions = babel.DEFAULT_EXTENSIONS,
	skipBabelHelpersCheck = false,
	// rollup uses sourcemap, babel uses sourceMaps
	// just normalize them here so people don't have to worry about it
	sourcemap = true,
	sourcemaps = true,
	sourceMap = true,
	sourceMaps = true,
	...rest
} = {}) => {
	if (!rest.babelHelpers) {
		throw new Error(
			'You have to specify how do you want to bundle/import "Babel helpers" (runtime functions inserted by Babel which are used by some transformations).\n\n' +
				'Please pass `babelHelpers` option to the rollup-plugin-babel with one of the following values:\n' +
				`  - "${RUNTIME}" - you should use it especially when building libraries with rollup. It has to be used in combination with \`@babel/plugin-transform-runtime\` and you should also specify \`@babel/runtime\` as dependency of your package (don't forget to tell rollup to treat it is your external dependency when bundling for cjs & esm formats).\n` +
				`  - "${BUNDLED}" - you should use it if you want your resulting bundle to contain those helpers (at most one copy of each). Useful especially if you bundle an application code.\n` +
				`  - "${EXTERNAL}" - use it only if you know what you are doing. It will reference helpers on **global** \`babelHelpers\` object. Used most commonly in combination with \`@babel/plugin-external-helpers\`.\n` +
				`  - "${INLINE}" - this is not recommended. Helpers will be inserted in each file using them, this can cause serious code duplication (this is default Babel behaviour)\n`,
		);
	}
	return {
		extensions,
		plugins: [],
		skipBabelHelpersCheck,
		sourceMaps: sourcemap && sourcemaps && sourceMap && sourceMaps,
		...rest,
		caller: { name: 'rollup-plugin-babel', supportsStaticESM: true, supportsDynamicImport: true, ...rest.caller },
	};
};

const returnObject = () => ({});

function createBabelPluginFactory(customCallback = returnObject) {
	const overrides = customCallback(babel);

	return pluginOptions => {
		let customOptions = null;

		if (overrides.options) {
			const overridden = overrides.options(pluginOptions);

			if (typeof overridden.then === 'function') {
				throw new Error(
					".options hook can't be asynchronous. It should return `{ customOptions, pluginsOptions }` synchronously.",
				);
			}
			({ customOptions = null, pluginOptions } = overridden);
		}

		const { babelHelpers, exclude, extensions, include, skipBabelHelpersCheck, ...babelOptions } = unpackOptions(
			pluginOptions,
		);

		const extensionRegExp = new RegExp(`(${extensions.map(escapeRegExpCharacters).join('|')})$`);
		const includeExcludeFilter = createFilter(include, exclude);
		const filter = id => extensionRegExp.test(id) && includeExcludeFilter(id);

		return {
			name: 'babel',
			resolveId(id) {
				if (id === HELPERS) return id;
			},
			load(id) {
				if (id !== HELPERS) {
					return;
				}

				return babel.buildExternalHelpers(null, 'module');
			},
			transform(code, filename) {
				if (!filter(filename)) return Promise.resolve(null);
				if (filename === HELPERS) return Promise.resolve(null);

				const config = babel.loadPartialConfig({ ...babelOptions, filename });

				// file is ignored by babel
				if (!config) {
					return Promise.resolve(null);
				}

				return Promise.resolve(
					!overrides.config
						? config.options
						: overrides.config.call(this, config, {
								code,
								customOptions,
						  }),
				)
					.then(transformOptions => {
						if (!skipBabelHelpersCheck) {
							preflightCheck(this, babelHelpers, transformOptions);
						}

						if (babelHelpers === BUNDLED) {
							transformOptions = addBabelPlugin(transformOptions, bundledHelpersPlugin);
						}

						const result = babel.transformSync(code, transformOptions);

						return !overrides.result
							? result
							: overrides.result.call(this, result, {
									code,
									customOptions,
									config,
									transformOptions,
							  });
					})
					.then(({ code, map }) => ({ code, map }));
			},
		};
	};
}

const babelPluginFactory = createBabelPluginFactory();
babelPluginFactory.custom = createBabelPluginFactory;

export default babelPluginFactory;
