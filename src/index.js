import * as babel from '@babel/core';
import { createFilter } from 'rollup-pluginutils';
import { EXTERNAL, HELPERS, RUNTIME } from './constants.js';
import helperPlugin from './helperPlugin.js';
import createPreflightCheck from './preflightCheck.js';
import transformCode from './transformCode';
import { addBabelPlugin, escapeRegExpCharacters, warnOnce } from './utils.js';

const unpackOptions = ({
	extensions = babel.DEFAULT_EXTENSIONS,
	// rollup uses sourcemap, babel uses sourceMaps
	// just normalize them here so people don't have to worry about it
	sourcemap = true,
	sourcemaps = true,
	sourceMap = true,
	sourceMaps = true,
	...rest
} = {}) => ({
	extensions,
	plugins: [],
	sourceMaps: sourcemap && sourcemaps && sourceMap && sourceMaps,
	...rest,
	caller: {
		name: 'rollup-plugin-babel',
		supportsStaticESM: true,
		supportsDynamicImport: true,
		...rest.caller,
	},
});

function getOptionsWithOverrides(pluginOptions = {}, overrides = {}) {
	if (!overrides.options) return { customOptions: null, pluginOptionsWithOverrides: pluginOptions };
	const overridden = overrides.options(pluginOptions);

	if (typeof overridden.then === 'function') {
		throw new Error(
			".options hook can't be asynchronous. It should return `{ customOptions, pluginsOptions }` synchronously.",
		);
	}

	return {
		customOptions: overridden.customOptions || null,
		pluginOptionsWithOverrides: overridden.pluginOptions || pluginOptions,
	};
}

const returnObject = () => ({});

function createBabelInputPluginFactory(customCallback = returnObject) {
	const overrides = customCallback(babel);

	return pluginOptions => {
		const { customOptions, pluginOptionsWithOverrides } = getOptionsWithOverrides(pluginOptions, overrides);

		const {
			exclude,
			extensions,
			externalHelpers,
			externalHelpersWhitelist,
			include,
			runtimeHelpers,
			...babelOptions
		} = unpackOptions(pluginOptionsWithOverrides);

		const preflightCheck = createPreflightCheck(true);
		const extensionRegExp = new RegExp(`(${extensions.map(escapeRegExpCharacters).join('|')})$`);
		const includeExcludeFilter = createFilter(include, exclude);
		const filter = id => extensionRegExp.test(id) && includeExcludeFilter(id);

		return {
			name: 'babel',

			resolveId(id) {
				if (id === HELPERS) return id;
			},

			load(id) {
				if (id === HELPERS) return babel.buildExternalHelpers(externalHelpersWhitelist, 'module');
			},

			transform(code, filename) {
				if (!filter(filename)) return Promise.resolve(null);
				if (filename === HELPERS) return Promise.resolve(null);

				return transformCode(code, { ...babelOptions, filename }, overrides, customOptions, this, transformOptions => {
					const helpers = preflightCheck(this, transformOptions);

					if (helpers === EXTERNAL && !externalHelpers) {
						warnOnce(
							this,
							'Using "external-helpers" plugin with rollup-plugin-babel is deprecated, as it now automatically deduplicates your Babel helpers.',
						);
					} else if (helpers === RUNTIME && !runtimeHelpers) {
						this.error(
							'Runtime helpers are not enabled. Either exclude the transform-runtime Babel plugin or pass the `runtimeHelpers: true` option. See https://github.com/rollup/rollup-plugin-babel#configuring-babel for more information',
						);
					}

					if (helpers !== RUNTIME && !externalHelpers) {
						return addBabelPlugin(transformOptions, helperPlugin);
					}
					return transformOptions;
				});
			},
		};
	};
}

function createBabelOutputPluginFactory(customCallback = returnObject) {
	const overrides = customCallback(babel);

	return pluginOptions => {
		const { customOptions, pluginOptionsWithOverrides } = getOptionsWithOverrides(pluginOptions, overrides);
		/* eslint-disable no-unused-vars */
		const {
			exclude,
			extensions,
			externalHelpers,
			externalHelpersWhitelist,
			include,
			runtimeHelpers,
			...babelOptions
		} = unpackOptions(pluginOptionsWithOverrides);
		/* eslint-enable no-unused-vars */

		return {
			name: 'babel',

			renderStart() {
				if (pluginOptionsWithOverrides.extensions || include || exclude) {
					warnOnce(this, 'The "include", "exclude" and "extensions" options are ignored when transforming the output.');
				}
			},

			renderChunk(code) {
				return transformCode(code, babelOptions, overrides, customOptions, this);
			},
		};
	};
}

const babelPluginFactory = createBabelInputPluginFactory();
babelPluginFactory.custom = createBabelInputPluginFactory;
babelPluginFactory.generated = createBabelOutputPluginFactory();
babelPluginFactory.generated.custom = createBabelOutputPluginFactory;

export default babelPluginFactory;
