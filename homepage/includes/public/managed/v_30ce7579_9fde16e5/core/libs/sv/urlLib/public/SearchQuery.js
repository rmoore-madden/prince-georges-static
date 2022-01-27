// umd boilerplate for CommonJS and AMD
if (typeof exports === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		factory(require, exports, module);
	};
}

/**
 * The SearchQuery object is a utility object that helps manage the state of 
 * a search query based on the default (implied) query and the current query.
 * It's primary use is for determining the query string for a given page's 
 * state without showing the default values in the url.
 *
 * ####Example:
 *
 *		// For a search page with a default category in the query string:
 *		// www.site.com/search/
 *
 *		var SearchQuery({ category : "dogs" }, {});
 *
 *		// www.site.com/search/
 *		searchQuery.getQueryString({ category : "dogs" });
 *
 *		// www.site.com/search/?category=cats
 *		searchQuery.getQueryString({ category : "cats" });
 *
 *		// www.site.com/search/?category=bears
 *		searchQuery.getQueryString({ category : "bears" });
 *
 *		// www.site.com/search/?tags[]=lab&tags[]=beagle
 *		searchQuery.getQueryString({ tags : ["lab", "beagle"] });
 */

define(function(require, exports, module) {
	var extend = require("extend");
	var lodash = require("lodash");
	var objectLib = require("@sv/objectLib");
	var qs = require("qs");

	var SearchQuery = function(defaultQuery, currentQuery) {
		var self = this;

		self.defaultQuery = extend({}, defaultQuery || {});
		self.currentQuery = extend({}, currentQuery || {});
	}

	/**
	 * Returns a new query having the contentes of the default query, current
	 * query and facet query merged together.
	 */

	SearchQuery.prototype.getFullQuery = function(facets) {
		var self = this;

		if (facets === undefined) facets = {};
		else facets = self._normalize(facets);
		return extend({}, self.defaultQuery, self.currentQuery, facets);
	}

	/**
	 * Returns a full query with empty strings key values removed.
	 */

	SearchQuery.prototype.getCleanFullQuery = function(facets) {
		var self = this;
		return objectLib.clean(self.getFullQuery(facets));
	}

	/**
	 * Given a query facet, return a new object containing the current page's
	 * search query merged in with the facet. If any values in this object 
	 * values in the defaul query, they will be removed.
	 *
	 *	Default Query + Current Query - Facet Query
	 *
	 * ####Example:
	 *
	 *		var SearchQuery({ category : "dogs" }, { tags : ["boxer"] });
	 *
	 *		searchQuery.getQuery({ tags : ["lab", "beagle"] });
	 *		// { tags : ["lab", "beagle"] }
	 *
	 *		searchQuery.getQuery();
	 *		// { tags : ["boxer"] }
	 *
	 *		searchQuery.getQuery({ category : "cats" }, { tags : ["sphynx"] });
	 *		// { category : "cats", tags : ["sphynx"] }
	 */

	SearchQuery.prototype.getQuery = function(facets) {
		var self = this;

		if (facets === undefined) facets = {};
		else facets = self._normalize(facets);
		return objectLib.diff(self.getFullQuery(facets), self._defaultQuery);
	}

	/**
	 * Returns a query string based on the getQuery function.
	 *
	 * @param {Object} [facets] optional filter options for new query string
	 */

	SearchQuery.prototype.getQueryString = function(facets) {
		var self = this;
		return "?" + qs.stringify(self.getQuery(facets));
	}

	/**
	 * Given a facet, determine if the state of the new query is equal to the
	 * state of the current query.
	 *
	 * ####Example:
	 *
	 *		var SearchQuery({ category : "dogs", page : 1 }, { tags : ["boxer"] });
	 *
	 *		searchQuery.isActive({ tags : ["boxer"] }); // true
	 *
	 *		searchQuery.isActive({ page : 1 }); // true
	 *
	 *		searchQuery.isActive({ page : 2 }); // false
	 *
	 *		searchQuery.isActive({ page : 1 , category : "dogs" }); // true
	 */

	SearchQuery.prototype.isActive = function(facets) {
		var self = this;
		return lodash.isEqual(self.getQuery(), self.getQuery(facets));
	}

	/** Getters and Setters */
	Object.defineProperty(SearchQuery.prototype, "defaultQuery", {
		get : function() { return this._defaultQuery; },
		set : function(query) {
			this._defaultQuery = this._normalize(query);
		}
	});

	Object.defineProperty(SearchQuery.prototype, "currentQuery", {
		get : function() { return this._currentQuery; },
		set : function(query) {
			this._currentQuery = this._normalize(query);
		}
	});

	/**
	 * When dealing with query string query data, most of the time we are 
	 * parsing the query string from the URL, manipulating it, and puting it
	 * backing into the URL. This can be problematic if we are using complex 
	 * objects or primitive types such as booleans and numbers. In order to 
	 * normalize our query data, especially when making equality checks, we 
	 * need to normalize it.
	 *
	 * Remove any empty string values from the object and ensure all object
	 * values are strings.
	 */
	SearchQuery.prototype._normalize = function(obj) {
		return extend({}, obj, qs.parse(qs.stringify(obj), { depth : 20, arrayLimit : 999 }));
	}

	module.exports = SearchQuery;
});