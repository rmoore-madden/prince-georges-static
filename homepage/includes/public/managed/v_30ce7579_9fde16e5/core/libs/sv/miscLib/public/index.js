// umd boilerplate for CommonJS and AMD
if (typeof exports === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var crypto = require("crypto");

	var objectLib = require("@sv/objectLib");

	var async = require("async");

	// Before/After sort with parallelism
	// data = array of strings: ["a","b","c"] 
	// rules = array of arrays: [["a", "b"],["c","b"]] indicates that b comes after a, and b comes after c
	// baSort will organize that result set into an array or object based on running the rules on the items
	var baSort = function(data, rules, returnType) {
		returnType = returnType || "array";
		
		var nodes = {};
		
		var node = function(name) {
			this.depth = null;
			this.name = name;
			this.befores = [];
		};
		
		node.prototype.getDepth = function(temp) {
			var self = this;
			
			if (this.depth !== null) {
				// if we have already calculated this nodes depth, return that value
				return this.depth;
			}
			
			if (typeof temp[this.name] !== "undefined") {
				// if we have already attempted to process this node and do not have a value we are infinitely recursive
				throw new Error("baSort: Infinitely recursive ruleset declared.");
			}
			
			var tempDepth = 0;
			
			// add name to object to prevent recursion
			temp[this.name] = true;
			
			// loop through befores and determine which before has the highest depth, and add one to that 
			this.befores.forEach(function(val, i) {
				var depth = val.getDepth(temp) + 1;
				
				if (depth > tempDepth) {
					tempDepth = depth;
				}
			});
			
			// set depth so that another node calling this node will return the pre-calculated value
			this.depth = tempDepth;
			
			return this.depth;
		}
		
		// loop through data and initialize nodes
		data.forEach(function(val, i) {
			nodes[val] = new node(val);
		});
		
		// loop through rules adding the nodes which come before each node
		rules.forEach(function(val, i) {
			nodes[val[1]].befores.push(nodes[val[0]]);
		});
		
		var result = returnType === "object" ? {} : [];
		
		// loop through data points and calculate their depth
		data.forEach(function(val, i) {
			var depth = nodes[val].getDepth({});
			
			if (returnType === "object") {
				result[val] = depth;
			} else {
				result[depth] = result[depth] || [];
				result[depth].push(val);
			}
		});
		
		return result;
	}

	// given a variable, it will recurse down that path until it finds the value
	// in example varLookup({ foo : { bar : "barValue" } }, "foo.bar") === "barValue"
	// if any undefined value is found it will return undefined
	var varLookup = function(variable, path) {
		if (variable === undefined) { return undefined; }
		
		var arr = (path instanceof Array) ? path : path.split(".");
		var current = variable;
		
		for(var i = 0; i < arr.length; i++) {
			current = current[arr[i]];
			
			if (current === undefined) {
				return undefined;
			}
		}
		
		return current;
	}

	// given a variable, it will recurse down that path and set it to the given value
	// if the path is valid. If the path is invalid it will throw an error
	var setValue = function(variable, path, value) {
		if (variable === undefined) { throw new Error("Unable to setValue. Variable undefined."); }
		
		var arr = (path instanceof Array) ? path : path.split(".");
		var current = variable;
		var last = arr.pop();
		
		for(var i = 0; i < arr.length; i++) {
			current = current[arr[i]];
			
			if (current === undefined) { throw new Error("Unable to setValue. Interim object at key '" + arr.slice(0, i + 1).join(".") + "' is undefined.") }
		}
		
		current[last] = value;
		
		return variable;
	}

	// hash arguments down to a md5 hash
	var hashObject = function(args) {
		var data = convertObjectsToArrays(args);
		var md5sum = crypto.createHash("md5");
		md5sum.update(JSON.stringify(data));
		
		return md5sum.digest("hex");
	}

	var convertObjectsToArrays = function(args) {
		var data = args;
		
		if (data instanceof Array) {
			data = Array.prototype.slice.call(args);
			data.forEach(function(val, i) {
				data[i] = convertObjectsToArrays(val);
			});
		} else if (typeof args === "object") {
			data = [];
			
			objectLib.forEach(args, function(val, i) {
				data.push([i, convertObjectsToArrays(val) ]);
			});
			
			// sorts based on the key name, case matters
			data.sort(function(a, b) {
				return (a[0] < b[0]) ? -1 : (a[0] > b[0]) ? 1 : 0;
			});
		}
		
		return data;
	}

	// memoize wrapper which handles serializing multi-argument functions. async.memoize in core only handles the first arg
	// https://github.com/caolan/async/issues/575#issuecomment-61915640
	var memoize = function(fn, args) {
		args = args || {};
		
		var wrappedFn = async.memoize(fn, function() {
			// v8 - argumentsToArray one-liner
			var args = new Array(arguments.length); for(var i = 0; i < arguments.length; i++) { args[i] = arguments[i]; }
			return JSON.stringify(args);
		});
		
		if (args.cacheErrors === false) {
			var newFn = function() {
				// v8 - argumentsToArray one-liner
				var args = new Array(arguments.length); for(var i = 0; i < arguments.length; i++) { args[i] = arguments[i]; }
				
				var key = JSON.stringify(args.slice(0, args.length - 1));
				
				var cb = args.pop();
				args.push(function() {
					// v8 - argumentsToArray one-liner
					var args = new Array(arguments.length); for(var i = 0; i < arguments.length; i++) { args[i] = arguments[i]; }
					
					if (args[0] !== null) {
						delete wrappedFn.memo[key];
					}
					
					cb.apply(null, args);
				});
				
				wrappedFn.apply(null, args);
			}
			
			// pass along memo values so downstream code works
			newFn.memo = wrappedFn.memo;
			newFn.unmemoized = wrappedFn.unmemoized;
			
			return newFn;
		} else {
			return wrappedFn;
		}
	}
	
	var memoizeSync = function(fn, hasher) {
		return _memoizeSyncHandler.bind(null, {}, fn, hasher || _memoizeSyncDefaultHasher);
	}
	
	var _memoizeSyncHandler = function(cache, fn, hasher) {
		var args = [];
		for(var i = 3; i < arguments.length; i++) { args.push(arguments[i]); }
		
		var key = hasher.apply(null, args);
		if (key in cache) { return cache[key]; }
		
		cache[key] = fn.apply(null, args);
		
		return cache[key];
	}
	
	var _memoizeSyncDefaultHasher = function() {
		var args = [];
		for(var i = 0; i < arguments.length; i++) { args[i] = arguments[i]; }
		
		var key = JSON.stringify(args);
		return key;
	}

	// given an array of cookie headers convert them into meaningful objects
	var extractCookies = function(setCookie) {
		var self = this;
		
		var result = {
			simple : {},
			cookies : []
		};
		
		setCookie.forEach(function(val, i) {
			var cookie = {};
			
			val.split(/;[\s]*/).forEach(function(val2, i2) {
				var labelValue = val2.split("=");
				
				if (i2 === 0) {
					cookie.label = labelValue[0];
					cookie.value = labelValue[1];
				} else {
					var tempValue = labelValue[1];
					
					if (labelValue[0] === "httponly") {
						tempValue = true;
					} else if (labelValue[0] === "expires") {
						cookie.expires_date = new Date(tempValue);
					}
					
					cookie[labelValue[0]] = tempValue;
				}
			});
			
			result.cookies.push(cookie);
			result.simple[cookie.label] = cookie.value;
		});
		
		return result;
	}

	// syntactic sugar for binding to a method and preserve the object as the this value, useful when doing a lot of async binds
	// miscLib.bind(foo.bar.baz.method, arg1, arg2) is equivalent to foo.bar.baz.method.bind(foo.bar.baz, "arg1", "arg2");
	var bind = function(obj, method) {
		// v8 - argumentsToArray one-liner
		var args = new Array(arguments.length); for(var i = 0; i < arguments.length; i++) { args[i] = arguments[i]; }
		args.splice(0, 2);
		
		return obj[method].bind.apply(obj[method], [obj].concat(args));
	}

	// trim the return of a callback so downstream functions don't get more values than they need which can throw object based async series/parallel in a tizzy
	var trimReturn = function(count, cb) {
		return function() {
			// v8 - argumentsToArray one-liner
			var args = new Array(arguments.length); for(var i = 0; i < arguments.length; i++) { args[i] = arguments[i]; }
			cb.apply(null, args.slice(0, count));
		}
	}
	
	// try/catch causes a v8 deopt so we move it to it's own function so that we don't force larger functions to deopt
	var tryCatch = function(fn) {
		try {
			return fn();
		} catch(e) {
			return e;
		}
	}
	
	// This function allows us to capture stack traces in callbacks from native systems which provide poor stack traces (fs, http, dns etc)
	var wrapErrorCb = function(cb) {
		// stash the existing state of the stack
		var frame = {};
		Error.captureStackTrace(frame);
		return function(err) {
			if (err) {
				// use the constructor of the original error, so it may be SyntaxError, Error or who knows
				var newErr = new err.constructor(err.message, err.code);;
				
				if (err.code !== undefined) {
					newErr.code = err.code;
				}
				
				// replace the first line on the stack so that it properly says Error: Message based on the error type and message
				newErr.stack = frame.stack.replace(/.*?\n/, err.name + ": " + err.message + "\n");
				return cb(newErr);
			}
			
			return cb.apply(null, arguments);
		}
	}

	module.exports = {
		baSort : baSort,
		varLookup : varLookup,
		setValue : setValue,
		hashObject : hashObject,
		memoize : memoize,
		memoizeSync : memoizeSync,
		extractCookies : extractCookies,
		bind : bind,
		trimReturn : trimReturn,
		tryCatch : tryCatch,
		wrapErrorCb : wrapErrorCb
	};
});