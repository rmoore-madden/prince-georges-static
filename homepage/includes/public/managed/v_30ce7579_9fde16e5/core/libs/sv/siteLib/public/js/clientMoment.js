define(["moment-timezone-with-data", "sv_site"], function(moment, site) {
	// returns a function which can be called just like moment() but will return the result automatically wrapped in the client's timezone
	// as declared in their client config file
	return function(constructor) {
		// v8 - argumentsToArray one-liner
		var args = new Array(arguments.length); for(var i = 0; i < arguments.length; i++) { args[i] = arguments[i]; }
		args.push(site.siteConfig.timezone);
		
		return moment.tz.apply(moment, args);
	}
});