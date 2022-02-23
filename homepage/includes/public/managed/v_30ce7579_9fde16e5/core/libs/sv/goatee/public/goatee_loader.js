define({
	load : function(name, req, onload, config) {
		var urlVars = {};
		var plugins = [];
		
		var supportedPlugins = {
			arrayLib : "sv_arrayLib",
			urlLib : "sv_urlLib",
			miscLib : "sv_miscLib",
			objectLib : "sv_objectLib",
			stringLib : "sv_stringLib",
			moment : "moment",
			numeral : "numeral",
			cloudinary : "sv_cloudinaryLib/default",
			clientMoment : "sv_clientMoment",
			crmLib : "sv_crmLib",
			videoLib : "sv_videoLib",
			sv_site : "sv_site",
			"plugins_dtn" : "plugins_dtn/goatee_plugin"
		}
		
		if (name !== "") {
			var terms = name.split("&");
			terms.forEach(function(val, i) {
				var parts = val.split("=");
				urlVars[parts[0]] = parts[1];
			});
		}
		
		var reqs = ["goatee"];
		
		if (urlVars.plugins !== undefined) {
			plugins = urlVars.plugins.split(",");
			
			reqs = reqs.concat(plugins.map(function(val, i) {
				return supportedPlugins[val];
			}));
		}
		
		req(reqs, function() {
			// v8 - argumentsToArray one-liner
			var args = new Array(arguments.length); for(var i = 0; i < arguments.length; i++) { args[i] = arguments[i]; }
			var goatee = new (args.shift()).Goatee()
			
			plugins.forEach(function(val, i) {
				goatee.addPlugin(val, args[i]);
			});
			
			// prevents downstream code from adding additional plugins or else we could hit nasty race conditions because this singleton is shared in many places
			goatee.lock();
			
			onload(goatee);
		});
	}
});