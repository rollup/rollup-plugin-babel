import { buildExternalHelpers, transform } from 'babel-core';
import { createFilter } from 'rollup-pluginutils';

function preflightCheck ( localOpts ) {
	var check = transform( 'export default class Foo {}', localOpts ).code;
	if ( ~check.indexOf( 'function _classCallCheck' ) ) throw new Error( 'External helpers are not enabled. Please add the "external-helpers-2" plugin or use the "es2015-rollup" preset. See https://github.com/rollup/rollup-plugin-babel#TK for more information' );
	if ( !~check.indexOf( 'export default' ) && !~check.indexOf( 'export { Foo as default }' ) ) throw new Error( 'It looks like your Babel configuration specifies a module transformer. Please disable it. If you\'re using the "es2015" preset, consider using "es2015-rollup" instead. See https://github.com/rollup/rollup-plugin-babel#TK for more information' );
}

function assign ( target, source ) {
	Object.keys( source ).forEach( key => {
		target[ key ] = source[ key ];
	});
	return target;
}

export default function babel ( options ) {
	options = assign( {}, options || {} );
	var usedHelpers = [];

	var filter = createFilter( options.include, options.exclude );
	delete options.include;
	delete options.exclude;

	if ( options.sourceMap !== false ) options.sourceMaps = true;
	if ( options.sourceMaps !== false ) options.sourceMaps = true;
	delete options.sourceMap;

	return {
		transform ( code, id ) {
			if ( !filter( id ) ) return null;

			var localOpts = assign({ filename: id }, options );
			preflightCheck( localOpts );

			var transformed = transform( code, localOpts );

			transformed.metadata.usedHelpers.forEach( helper => {
				if ( !~usedHelpers.indexOf( helper ) ) usedHelpers.push( helper );
			});

			return {
				code: transformed.code,
				map: transformed.map
			};
		},
		intro () {
			// TODO replace babelHelpers.foo with babelHelpers_foo – though first
			// we need the ability to find and replace within the generated bundle
			return usedHelpers.length ?
				buildExternalHelpers( usedHelpers, 'var' ).trim() :
				'';
		}
	};
}