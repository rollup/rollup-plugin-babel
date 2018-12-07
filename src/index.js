import babelCore, { buildExternalHelpers, DEFAULT_EXTENSIONS, loadPartialConfig, transform } from '@babel/core';
import { createFilter } from 'rollup-pluginutils';
import createPreflightCheck from './preflightCheck.js';
import helperPlugin from './helperPlugin.js';
import { escapeRegExpCharacters, warnOnce } from './utils.js';
import { RUNTIME, EXTERNAL, HELPERS } from './constants.js';

const unpackOptions = ({
	extensions = DEFAULT_EXTENSIONS,
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

function babel({ options, result, config, customOptions }) {
	// TODO: remove it later, just provide a helpful warning to people for now
	try {
		loadPartialConfig({
			caller: undefined,
			babelrc: false,
			configFile: false,
		});
	} catch (err) {
		throw new Error(
			'You should be using @babel/core@^7.0.0-rc.2. Please upgrade or pin rollup-plugin-babel to 4.0.0-beta.8',
		);
	}

	const {
		exclude,
		extensions,
		externalHelpers,
		externalHelpersWhitelist,
		include,
		runtimeHelpers,
		...babelOptions
	} = customOptions ? customOptions(unpackOptions(options)) : unpackOptions(options);

	const extensionRegExp = new RegExp(`(${extensions.map(escapeRegExpCharacters).join('|')})$`);
	const includeExcludeFilter = createFilter(include, exclude);
	const filter = id => extensionRegExp.test(id) && includeExcludeFilter(id);
	const preflightCheck = createPreflightCheck();

	return {
		name: 'babel',

		resolveId(id) {
			if (id === HELPERS) return id;
		},

		load(id) {
			if (id !== HELPERS) {
				return;
			}

			return buildExternalHelpers(externalHelpersWhitelist, 'module');
		},

		transform(code, id) {
			if (!filter(id)) return null;
			if (id === HELPERS) return null;

			const helpers = preflightCheck(this, babelOptions, id);

			if (!helpers) {
				return { code };
			}

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

			const localOpts = {
				filename: id,
				...(config ? config(loadPartialConfig()) : babelOptions),
				plugins: helpers !== RUNTIME ? [...babelOptions.plugins, helperPlugin] : babelOptions.plugins,
			};

			// TODO hook config here
			const transformed = transform(code, localOpts);

			let output;
			if (!transformed) {
				output = { code };
			} else {
				output = {
					code: transformed.code,
					map: transformed.map,
				};
			}

			return result ? result(output) : output;
		},
	};
}

function babelPlugin(options) {
	return babel({ options });
}

babelPlugin.custom = input => babel({ ...input(babelCore) });

export default babelPlugin;
