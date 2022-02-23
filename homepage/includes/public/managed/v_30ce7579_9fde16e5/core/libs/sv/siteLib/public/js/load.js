// loader plugin used for conditionally loading paths and packages
// if the package/path doesnt exist this will return undefined rather than an error
define(["lodash"], function(lodash){
	return {
		load : function(name, req, onload, config) {
			// requirejs does some odd normalization for plugins
			// asking for "sv_load!plugins_listings" causes name === plugins_listings/main which is inside config.pkgs as a value
			// invert the object so that it we can check with a standard object lookup
			var inverted = lodash.invert(config.pkgs);
			
			if (config.paths[name] === undefined && inverted[name] === undefined) { return onload(undefined); }
			
			require([name], function(module) {
				onload(module);
			});
		}
	};
});