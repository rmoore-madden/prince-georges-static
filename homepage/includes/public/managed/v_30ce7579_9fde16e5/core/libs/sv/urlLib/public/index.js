// umd boilerplate for CommonJS and AMD
if (typeof exports === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var extend = require("extend");
	var qs = require("qs");
	var arrayLib = require("@sv/arrayLib");
	var objectLib = require("@sv/objectLib");
	var SearchQuery = require("./SearchQuery");
	var url = require("url-browser-require");
	
	var build = function(data) {
		var r = "";
		
		if (data.scheme !== undefined) { r += data.scheme+"://"; }
		if (data.scheme === undefined && data.host !== undefined) { r += "//"; }
		if (data.user !== undefined) {
			r += data.user;
			if (data.pass === undefined) { r += "@"; }
		}
		if (data.pass !== undefined) { r += ":" + data.pass + "@"; }
		if (data.host !== undefined) { r += data.host; }
		if (data.port !== undefined) { r += ":" + data.port; }
		if (data.path !== undefined) { r += data.path; }
			
		var q = data.get && qs.stringify(data.get) || data.query;
		if (q) { r += "?" + q; }
			
		if (data.hash !== undefined) { r += "#" + data.hash; }
			
		return r || data.url || "";
	}

	var fixGoatee = function(str) {
		return str.replace(/%7B/g, "{").replace(/%7D/g, "}");
	}
	
	// overwrites and appends the query string with values from data object
	var overwriteQuery = function(urlString, data) {
		var urlObj = parse(urlString);
		urlObj.get = extend({}, urlObj.get, data);
		return build(urlObj);
	}
	
	var parse = function(urlString) {
		if (urlString === undefined) { throw new Error("Parameter 'url' must be a string, not undefined") }
		
		var noProtocol = urlString.indexOf("//") === 0;
		var a = url.parse(noProtocol ? "http:" + urlString : urlString, false, false);
		var auth = a.auth ? a.auth.split(":") : undefined;
		var r = {
			url : urlString, 
			scheme : noProtocol ? undefined : a.protocol !== null ? a.protocol.replace(":", "") : undefined,
			auth : auth,
			user : auth !== undefined ? auth[0] : undefined, 
			pass : auth !== undefined ? auth[1] : undefined,
			host : a.hostname !== null ? a.hostname : undefined, 
			port : a.port !== null ? Number(a.port) : undefined, 
			path : a.pathname !== null ? a.pathname : undefined,
			query : a.query !== null ? a.query : undefined, 
			hash : a.hash !== null ? a.hash.replace("#", "") : undefined
		};
		r.get = qs.parse(r.query, { depth : 20, arrayLimit : 999 });
		return r;
	}
	
	// converts a URL such as /foo/?xyz=123&abc=456 into /foo/?abc=456&xyz=123 , alpha sorting the query parameters
	// foo[b]&foo[a] should become foo[a]&foo[b]
	// foo[0]=b&foo[1]=a or foo=b&foo=a should remain as [b,a]
	var queryAlphaSort = function(urlString) {
		var urlObj = parse(urlString);
		if (urlObj.query === undefined || urlObj.query === "") { return urlString; }
		
		var pairsRaw = urlObj.query.split("&");
		var pairs = [];
		pairsRaw.forEach(function(val, i) {
			var temp = val.split("=");
			
			pairs.push({ key : temp[0], value : temp[1] });
		});
		
		pairs = arrayLib.sortBy(pairs, [["key", "alpha", "asc"], ["value", "alpha", "asc"]]);
		
		var endQuery = pairs.map(function(val, i) {
			return val.key + (val.value === undefined ? "" : "=" + val.value);
		}).join("&");
		
		delete urlObj.get;
		urlObj.query = endQuery;
		
		return build(urlObj);
	}

	var slugify = function(s) {
		// trims
		// replaces space, period, comma, tilde, backtick, slashes with "-"
		// replaces apostrophe, double quote with nothing
		// replaces cases of "-----" with "-"
		// trims
		// encodes as URI
		// lowercases
		
		var replace_unwanted = s.trim()
			.replace(/[\s\.,~`\\\/]+/g, '-')
			.replace(/['"]/g, '')
			.replace(/[-]+/g, '-')
			.replace(/^[-]/g, '')
			.replace(/[-]$/g, '')
			.trim();
			
		// at a minimum, we should return "-"
		return encodeURIComponent(replace_unwanted || "-").toLowerCase();
	}
	
	var whitelistQuery = function(str, valid) {
		var urlObj = parse(str);
		
		objectLib.forEach(urlObj.get, function(val, key) {
			if (valid.indexOf(key) === -1) {
				delete urlObj.get[key];
			}
		});
		
		delete urlObj.query;
		
		return build(urlObj);
	}
	
	var blacklistQuery = function(str, invalid) {
		var urlObj = parse(str);
		
		invalid.forEach(function(key) {
			delete urlObj.get[key];
		});
		
		delete urlObj.query;
		
		return build(urlObj);
	}
	
	// Determine the target of a url based on an array of valid hostnames.
	// Relative urls, "" and urls on one of the valid hostnames will be _self, all else will be _blank
	var calculateTarget = function(args) {
		if (args.url === undefined) { throw new Error("calculateTarget must get a 'url'"); }
		
		args.url = args.url || "";
		args.validDomains = args.validDomains || [];
		
		if (args.url.match(/^(https?:)?\/\//) !== null) {
			// only parse URLs which start with http, https or //
			var parsed = parse(args.url);
			return args.validDomains.indexOf(parsed.host) > -1 ? "_self" : "_blank";
		} else if (args.url.indexOf("mailto:") === 0) {
			// if using browser-based email client handler, you are leaving site, so should open in new tab
			// this might open blank tab with desktop app email client, but better experience than navigating away from site
			return "_blank";
		}
		
		// assume _self for all other urls, such as 'tel:', 'mailto:', and '/'
		return "_self";
	}
	
	module.exports = {
		build : build,
		calculateTarget : calculateTarget,
		fixGoatee : fixGoatee,
		overwriteQuery : overwriteQuery,
		parse : parse,
		queryAlphaSort : queryAlphaSort,
		slugify : slugify,
		whitelistQuery : whitelistQuery,
		blacklistQuery : blacklistQuery,
		SearchQuery : SearchQuery
	}
});