import { dirname } from 'path';
import { buildExternalHelpers, transform } from '@babel/core';
import { createFilter } from 'rollup-pluginutils';
import createPreflightCheck from './preflightCheck.js';
import helperPlugin from './helperPlugin.js';
import { warnOnce } from './utils.js';
import { RUNTIME, EXTERNAL, HELPERS } from './constants.js';
import sha256 from 'hash.js/lib/hash/sha/256';

const unpackOptions = ({
	// rollup uses sourcemap, babel uses sourceMaps
	// just normalize them here so people don't have to worry about it
	sourcemap = true,
	sourcemaps = true,
	sourceMap = true,
	sourceMaps = true,
	...rest
} = {}) => ({
	sourceMaps: sourcemap && sourcemaps && sourceMap && sourceMaps,
	...rest
});

export default function babel ( options ) {
	const {
		exclude,
		externalHelpers,
		externalHelpersWhitelist,
		include,
		runtimeHelpers,
		...babelOptions
	} = unpackOptions(options);

	const filter = createFilter( include, exclude );
	const preflightCheck = createPreflightCheck();

	return {
		name: 'babel',

		resolveId ( id ) {
			if ( id === HELPERS ) return id;
		},

		load ( id ) {
			if ( id !== HELPERS ) {
				return;
			}

			return buildExternalHelpers( externalHelpersWhitelist, 'module' );
		},

		transform ( code, id ) {
			if ( !filter( id ) ) return null;
			if ( id === HELPERS ) return null;

			const cacheKey = `${id}|${code.length}`;
			const digest = sha256().update(code).digest('hex');

			const cache = this.cache && this.cache.get(cacheKey);
			if (cache && digest === cache.digest) {
				return cache.result;
			} else {
				this.cache && this.cache.delete(cacheKey);
			}

			const helpers = preflightCheck( this, babelOptions, dirname( id ) );

			if ( helpers === EXTERNAL && !externalHelpers ) {
				warnOnce( this, 'Using "external-helpers" plugin with rollup-plugin-babel is deprecated, as it now automatically deduplicates your Babel helpers.' );
			} else if ( helpers === RUNTIME && !runtimeHelpers ) {
				this.error( 'Runtime helpers are not enabled. Either exclude the transform-runtime Babel plugin or pass the `runtimeHelpers: true` option. See https://github.com/rollup/rollup-plugin-babel#configuring-babel for more information' );
			}

			let localOpts = Object.assign({ filename: id }, babelOptions);

			if ( helpers !== RUNTIME ) {
				localOpts = Object.assign({}, localOpts, { plugins: (localOpts.plugins || []).concat(helperPlugin) });
			}

			const transformed = transform( code, localOpts );

			if (!transformed) {
				this.cache && this.cache.set(cacheKey, { digest, result: { code } });
				return { code };
			}

			const result = {
				code: transformed.code,
				map: transformed.map
			};
			this.cache && this.cache.set(cacheKey, { digest, result });
			return result;
		}
	};
}
