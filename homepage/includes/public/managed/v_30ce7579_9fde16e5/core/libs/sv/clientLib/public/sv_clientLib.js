define(["jquery", "async", "qs", "sv_urlLib", "sv_site", "sv_miscLib", "jsvalidator", "lodash", "sv_stringLib"], function($, async, qs, urlLib, site, miscLib, jsvalidator, lodash, stringLib) {
	var _uuidCounter = 0;
	
	var uuid = function() {
		_uuidCounter++;
		return (new Date).getTime() + "" + _uuidCounter;
	}
	
	var formToObject = function(form) {
		return getNodeFormData(form);
	}
	
	// get the serializable inputs from any jQuery node, can be a form or another container
	// parameterLimit allows parsing of massive forms, such as role permissions
	var getNodeFormData = function(node) {
		var serialized = node.find("input,textarea,select").serialize();
		return qs.parse(serialized, { parameterLimit : Infinity });
	}
	
	// wrapper for /plugins/core/json_to_csv/ allowing conversion of an arbitrary data array into a named csv file for download
	var downloadCsv = function(args) {
		// remove the previous download div
		$("#clientLib_downloadCsv").remove();
		var ifid = "downloadCsv_iframe_"+uuid();
		
		// generate a div with an iframe and form to allow it to submit via post
		var div = $("<div id='clientLib_downloadCsv' style='display:none;'><iframe name='"+ifid+"'></iframe><form method='POST' action='/plugins/core/json_to_csv/' target='"+ifid+"'><input type='text' name='json' /></form></div>");
		div.find("input[name=json]").val(JSON.stringify(args));
		$(document.body).append(div);
		div.find("form").submit();
	};
	
	var getDeferredPromise = function() {
		var resolvePromise;
		var rejectPromise;
		var promise = new Promise(function(resolve, reject) {
			resolvePromise = resolve;
			rejectPromise = reject;
		});
		
		return { promise : promise, resolve : resolvePromise, reject : rejectPromise };
	}

	var checkCmsLogin = async.memoize(function(args, cb){
		// only checks the cmsLogin if we're either in the preview circumstance
		if (!inPreview()) {
			return cb(null, { loggedIn : false });
		}
		
		$.ajax({
			url : site.cmsUrl + "plugins/cms/loginstatus/",
			xhrFields : {
				withCredentials : true
			},
			complete : function(data) {
				return cb(null, data.responseJSON);
			}
		});
	});
	
	// iOS has a horrible issue where it calls resize on scroll events
	// in order to avoid this we have to ensure that our element has actually changed sizes in order to warrant a resize
	var ensureOnResize = function(fn) {
		var width;
		var height;
		
		return function() {
			var newWidth = $(window).width();
			var newHeight = $(window).height();
			
			if (width === newWidth && newHeight === height) { return; }
			
			width = newWidth;
			height = newHeight;
			
			fn.apply(this, arguments);
		}
	}
	
	var isIOS = function() {
		return navigator.userAgent.match(/iPod|iPhone|iPad/) !== null;
	}

	var isAndroid = function() {
		return navigator.userAgent.match(/Android/) !== null;
	}
	
	var initResponsive = function() {
		var html = $('html');
		
		// http://foundation.zurb.com/docs/media-queries.html
		var sizes = {
			small : [0,640],
			medium : [641,1024],
			large : [1025,1440],
			xlarge : [1441,1920],
			xxlarge : [1921,9999]
		};
	
		$(window).off('resize.sv_clientLib_initResponsive').on('resize.sv_clientLib_initResponsive', ensureOnResize(function(){
			$.each(sizes,function(i,v){
				html.removeClass('sv-eq-'+i+' sv-gt-'+i+' sv-lt-'+i);
				if (matchMedia('only screen and (min-width:'+v[0]+'px) and (max-width:'+v[1]+'px)').matches) {
					html.addClass('sv-eq-'+i);
				} else {
					if (matchMedia('only screen and (min-width:'+v[0]+'px)').matches) {
						html.addClass('sv-gt-'+i);
					} else if (matchMedia('only screen and (max-width:'+(v[1] + 1)+'px)').matches) {
						html.addClass('sv-lt-'+i);
					}
				}
			});
		})).trigger('resize.sv_clientLib_initResponsive');
	}
	
	var getCallbackSeriesArray = function(args) {
		return new CallbackSeriesArray(args);
	}
	
	// execute a series of callbacks in order, each callback will recieve the same input
	// any callback returning an error or non-null return will halt the flow and pass that return up
	var CallbackSeriesArray = function(args) {
		var self = this;
		self._calls = [];
	}
	
	CallbackSeriesArray.prototype.add = function(handler) {
		var self = this;
		self._calls.push(handler);
	}
	
	// executes callback array in order, returns an error it will halt future calls and return the error
	// syntax: 	arr.execute(function(err) {})
	// 			arr.execute(arg1, function(err) {});
	//			arr.execute(arg1, arg2, arg3, ..., function(err) {});
	CallbackSeriesArray.prototype.execute = function() {
		var self = this;
		
		// v8 - argumentsToArray one-liner
		var args = new Array(arguments.length); for(var i = 0; i < arguments.length; i++) { args[i] = arguments[i]; }
		var cb = args.pop();
		
		var calls = [];
		self._calls.forEach(function(val, i) {
			calls.push(function(cb2) {
				val.apply(val, [].concat(args).concat(cb2));
			});
		});
		
		async.series(calls, cb);
	}
	
	var _getData = function(node, name) {
		var key = "sv_clientLib_event_" + name;
		var data = node.data(key);
		
		if (data === undefined) {
			var data = {
				called : false,
				queue : []
			}
			node.data(key, data);
		}
		
		return data;
	}
	
	var eventOnce = function(name, handler) {
		return this.each(function() {
			var data = _getData($(this), name);
			if (!data.called) {
				data.queue.push(handler);
			} else {
				handler.apply(handler, data.args);
			}
		});
	}
	
	var eventReset = function(name) {
		return this.each(function() {
			var data = $(this).data();
			delete data["sv_clientLib_event_" + name];
		});
	}
	
	var triggerOnce = function(name) {
		var args = [].slice.call(arguments, 1);
		return this.each(function() {
			var data = _getData($(this), name);
			data.called = true;
			data.args = args;
			data.queue.forEach(function(val) {
				val.apply(val, args);
			});
		});
	}
	
	/**
		@description Takes a jQuery object of img tags and when the images have loaded calls the callback function  It can also take an optional failcallback which will be called if a specific image fails to load 
		@param {Array} nodes : An array of DOM Elements to attach to
		@param {Function} Callback: A function to call when image is ready
		@param {Function} failcallback : A function to call when a given DOM element fails to loead
	*/
	var imagesReady = function(nodes, callback, failcallback) {
		var total = nodes.length;
		var loaded = 0;
		var call = callback;
		
		if (total == 0) {
			callback();
			return false;
		}
		
		nodes.each(function() {
			var img = new Image();
			img.onload = function() {
				loaded++;
				if (loaded == total) {
					callback();
					return false;
				}
			}
			img.onerror = function() {
				if (typeof failcallback == "function") {
					failcallback(img.src);
					loaded++;
					if (loaded == total) {
						callback();
						return false;
					}
				}
			}
			
			img.src = $(this).attr("src");
		});
	}
	
	var inPreview = function() {
		var url = urlLib.parse(window.location.href);
		return window.location.pathname === "/includes/plugins/nav/preview_civs/" || url.get.preview === "true";
	}
	
	// private since it is under development, not safe for developer usage
	var _isOnScreen = function(args) {
		// getBoundingClientRect() returns the relative positions of the top and bottom of the element relative to the viewable area
		var rect = args.node.get(0).getBoundingClientRect();
		
		var topOnOrAbove = (args.scrollNode.outerHeight() - args.padding) - (rect.top - args.scrollNode.offset().top) > 0;
		var bottomOnOrBelow = (rect.bottom - args.scrollNode.offset().top) - args.padding > 0;
		return topOnOrAbove && bottomOnOrBelow;
	}

	var scrollTo = function(args, callback) {
		jsvalidator.validate(args, {
			type : "object",
			schema : [
				// the element we're scrolling to
				{ name : "node", type : "class", class : $, required : true },
				// the element doing the scrolling html,body is required because some browsers use html, some use body for scrolling
				{ name : "scrollNode", type : "class", class : $, default : function() { return $("html,body") } },
				// allows scrolling slightly past or before the element
				{ name : "yOffset", type : "number", default : 0 },
				// duration of the animation
				{ name : "duration", type : "number", default : 0 },
				// Checks isTopOnscreen() - if scrollIfVisible is true it will scroll to top of node, else do not scroll
				{ name : "scrollIfOnScreen", type : "boolean", default : true },
				// when determining ifOnScreen we utilize a padding so that elements which are juuuust barely on screen are not considered on screen
				{ name : "onScreenPadding", type : "number", default : 0 } // element must be within 100px of onScreen 
			],
			allowExtraKeys : false,
			throwOnInvalid : true
		});
		
		callback = callback || function() {}; // callback to execute after completion

		// element is not visible - cannot scroll to it
		if (args.node.is(":visible") === false) { return callback(); }

		// node already on screen
		if (args.scrollIfOnScreen === false && _isOnScreen({ node : args.node, padding : args.onScreenPadding, scrollNode : args.scrollNode })) { return callback(); }
		
		// if my node or the parent node is fixed position, there's no use in scrolling as the offsets we get are bogus, simply return
		var parentNodes = args.node.add(args.node.parents());
		for(var i = 0; i < parentNodes.length; i++) {
			if (parentNodes.eq(i).css("position") === "fixed") { return callback(); }
		}
		
		// when scrollNode is body, offset represents distance from the document, when scrollNode is not body offset doesn't include the scroll distance
		// therefore we add the scrollTop of the scrollNode in when not using the body + distance from document + yOffset - distance of scrollNode from the document
		// this does not support scrolls within scrolls, but that seems like a ridiculous use case
		var scrollTop = (args.scrollNode.is("body") ? 0 : args.scrollNode.scrollTop()) + args.node.offset().top + args.yOffset - args.scrollNode.offset().top;
		
		var called = 0;
		args.scrollNode.stop().animate({ scrollTop : scrollTop }, args.duration, function() {
			called++;
			
			// when passing default scrollNode $("html,body") the callback is called multiple times, so we only call the passed callback once after both have fired
			if (called === args.scrollNode.length) {
				callback();
			}
		});
	}
	
	// gets attributes object from a jquery wrapped dom node
	var getAttributes = function(node) {
		var attributes = node.get(0).attributes;
		var returnData = {};
		
		for(var i = 0; i < attributes.length; i++) {
			var att = attributes[i];
			returnData[att.name] = att.nodeValue;
		}
		
		return returnData;
	}
	
	var renameAttribute = function(node, from, to) {
		var currentValue = node.attr(from);
		node.removeAttr(from);
		if (currentValue === undefined) {
			node.removeAttr(to);
		} else {
			node.attr(to, currentValue);
		}
	}
	
	var localStorageAvailable = function() {
		return _checkStorage("localStorage");
	}
	
	var sessionStorageAvailable = function() {
		return _checkStorage("sessionStorage");
	}
	
	var _checkStorage = function(type) {
		var storageAvailable = true;
		
		try {
			var key = "clientLib_storageCheck";
			window[type].setItem(key, "1");
			window[type].removeItem(key);
		} catch(e) {
			storageAvailable = false;
		}
		
		return storageAvailable;
	}
	
	// get the events on a given jQuery node, only use this for debugging as it relies on some jQuery hacks to operate
	// http://stackoverflow.com/questions/2518421/jquery-find-events-handlers-registered-with-an-object
	var getEvents = function(node) {
		return $._data(node.get(0), "events");
	}
	
	var getCookies = function() {
		var temp = document.cookie.split("; ");
		var result = temp.reduce(function(prev, curr) {
			var parts = curr.split("=");
			prev[parts[0]] = parts[1];
			return prev;
		}, {});
		
		return result;
	}
	
	var getCookie = function(name) {
		var temp = getCookies();
		return temp[name];
	}
	
	var setCookie = function(args) {
		jsvalidator.validate(args, {
			type : "object",
			schema : [
				{ name : "name", type : "string", required : true },
				{ name : "value", type : "string", required : true },
				{ name : "path", type : "string" },
				{ name : "domain", type : "string" },
				{ name : "max-age", type : "number" },
				{ name : "sameSite", type : "string" },
				{ name : "secure", type : "boolean" }
			],
			allowExtraKeys : false,
			throwOnInvalid : true
		});
		
		var terms = {};
		terms[args.name] = encodeURIComponent(args.value);
		
		["path", "domain", "max-age", "sameSite"].forEach(function(val) {
			if (args[val] !== undefined) {
				terms[val] = args[val];
			}
		});
		
		var str = "";
		for(var i in terms) {
			str += i + "=" + terms[i] + "; ";
		}
		
		["secure"].forEach(function(val) {
			if (args[val] === true) {
				str += `${val}; `;
			}
		});
		
		document.cookie = str;
	}
	
	var removeCookie = function(name) {
		document.cookie = name + "=; max-age=0;";
	}
	
	// provides an easier mechanism for using localStorage / sessionStorage as a cache store
	var StorageCache = function(args) {
		var self = this;
		
		args = args || {};
		
		jsvalidator.validate(args, {
			type : "object",
			schema : [
				{ name : "type", type : "string", enum : ["localStorage", "sessionStorage"], required : true },
				{ name : "storageKey", type : "string", required : true }
			],
			throwOnInvalid : true,
			allowExtraKeys : false
		});
		
		self._args = args;
		self._storageKey = args.storageKey; // "plugins_foo_something"
		self._storageAvailable = _checkStorage(args.type);
		self._storage = window[args.type];
	};
	
	StorageCache.prototype.getObj = function() {
		var self  = this;
		
		return self._storageAvailable ? JSON.parse(self._storage.getItem(self._storageKey) || "{}") : {};
	};
	
	StorageCache.prototype.get = function(key) {
		var self = this;
		
		return self.getObj()[key];
	};
	
	StorageCache.prototype.setObj = function(data) {
		var self = this;
		
		if (self._storageAvailable !== true) { return; }
		
		if (typeof data !== "object") {
			throw new Error("Must pass object to setObj");
		}
		
		self._storage.setItem(self._storageKey, JSON.stringify(data));
	};
	
	StorageCache.prototype.set = function(key, data) {
		var self = this;
		
		if (self._storageAvailable !== true) { return; }
		
		var cache = self.getObj();
		cache[key] = data;
		
		self.setObj(cache);
	};
	
	StorageCache.prototype.remove = function(key) {
		var self = this;
		
		if (self._storageAvailable !== true) { return; }
		
		var cache = self.getObj();
		delete cache[key];
		
		self.setObj(cache);
	};
	
	StorageCache.prototype.clear = function() {
		var self = this;
		
		if (self._storageAvailable !== true) { return; }
		
		self._storage.removeItem(self._storageKey);
	};

	// Test Class for push/pop state and link/form processing
	// Do not use, not even close to final
	var UrlWatcher = function(args) {
		var self = this;
		
		self._callbacks = [];
		self._node = args.node;
		self._lastHref = null;
	}
	
	UrlWatcher.prototype._process = function(href, push) {
		var self = this;
		
		// converts any path form "/foo", "./foo", "../foo" to a standardized absolute path
		var a = document.createElement("a");
		a.href = href;
		
		if (a.href === self._lastHref) {
			// take no action if the href we're going to is the current href
			return;
		}
		
		self._lastHref = a.href;
		
		var state = urlLib.parse(a.href);
		
		if (history.pushState && push) {
			history.pushState(state, "", a.href);
		}
		
		async.applyEach(self._callbacks, state, function(err) {
			self._node.find("a[data-sv-urlWatcher]").each(function() {
				a.href = $(this).attr("href");
				
				var attr = "data-sv-urlWatcher-current";
				if (a.href === window.location.href) {
					$(this).attr(attr, "true");
				} else {
					$(this).removeAttr(attr);
				}
			});
		});
	}
	
	UrlWatcher.prototype.on = function(fn) {
		var self = this;
		
		self._callbacks.push(fn);
	}
	
	UrlWatcher.prototype.off = function(fn) {
		var self = this;
		
		var index = self._callbacks.indexOf(fn);
		self._callbacks.splice(index, 1);
	}
	
	UrlWatcher.prototype.init = function() {
		var self = this;
		
		// process the current url
		self._process(window.location.href, false);
		
		if (!history.pushState) {
			// if the browser doesn't support push state we fall back to native behaviors
			return;
		}
		
		history.replaceState(urlLib.parse(window.location.href), "", window.location.href);
		
		// args.node
		self._node.on("click", "a[data-sv-urlWatcher]", function(e) {
			e.preventDefault();
			self._process($(this).attr("href"), true);
		});
		
		self._node.on("submit", "form[data-sv-urlWatcher]", function(e) {
			e.preventDefault();
			self._process("?" + $(this).serialize(), true);
		});
		
		window.onpopstate = function(e) {
			self._process(e.state.url);
		}
	}
	
	// Message handler for use in communicating via PostMessage between two frames
	// automatically handles ensuring that a specific namespace is used and filters out message not senting using this sytem
	var PostMessenger = function(args) {
		var self = this;
		
		jsvalidator.validate(args, {
			type : "object",
			schema : [
				{ name : "namespace", type : "string", required : true },
				{ name : "window", type : "object", required : true }
			],
			allowExtraKeys : false,
			throwOnInvalid : true
		});
		
		self._args = args;
		self._handlers = {};
		
		self._messageHandler = function(e) {
			if (e.originalEvent.source !== self._args.window) { return; } // sent from another window
			
			var data = miscLib.varLookup(e, "originalEvent.data");
			if (typeof data !== "object") { return; } // data not sent via PostMessenger
			if (data.namespace !== self._args.namespace) { return; } // invalid namespace for this handler
			
			var handlers = self._handlers[data.event]; // check for handlers on this event
			if (handlers === undefined) { return; }
			
			handlers.forEach(function(val, i) {
				val(data.args);
			});
		}
		
		$(window).on("message", self._messageHandler);
	}
	
	PostMessenger.prototype.on = function(event, handler) {
		var self = this;
		
		self._handlers[event] = self._handlers[event] || [];
		self._handlers[event].push(handler);
	}
	
	PostMessenger.prototype.off = function(event, handler) {
		var self = this;
		
		self._handlers[event] = self._handlers[event] || [];
		
		if (handler === undefined) {
			self._handlers[event] = [];
		} else {
			lodash.pull(self._handlers[event], handler);
		}
	}
	
	PostMessenger.prototype.emit = function(event, args) {
		var self = this;
		
		self._args.window.postMessage({ namespace : self._args.namespace, event : event, args : args }, "*");
	}
	
	PostMessenger.prototype.unbind = function() {
		var self = this;
		
		$(window).off("message", self._messageHandler);
	}
	
	// lazy load content with data-sv-lazy attribute, triggered in the global footer
	// must be loaded in script type="text/template" and inside a wrapper dom element
	var _initLazy = function() {
		if ($("[data-sv-lazy]").length === 0) {
			// no nodes to load, nothing to do
			return;
		}
		
		// queue lazy items to load 5 seconds after domReady
		$(function() {
			setTimeout(function() {
				$("[data-sv-lazy]").each(function(i, val) {
					load($(val));
				});
			}, 5000);
		});
		
		var scrollWatcher = lodash.debounce(function() {
			var nodes = $("[data-sv-lazy]");
			if (nodes.length === 0) {
				// no events left to init, unbind the scrollWatcher
				return $(window).off("scroll", scrollWatcher);
			}
			
			nodes.each(function(i, val) {
				// check each node and if they are in 2 screen lengths, load them
				if ($(window).scrollTop() + (window.innerHeight * 2) > $(val).parent().offset().top) {
					load($(val));
				}
			});
		}, 100, { maxWait : 200 });
		
		var load = function(node) {
			node.parent().html(stringLib.decodeScriptTags(node.html()));
		}
		
		$(window).on("scroll", scrollWatcher);
		scrollWatcher();
	}
	
	var hashFile = function(args, cb) {
		jsvalidator.validate(args, {
			type : "object",
			schema : [
				{ name : "file", type : "class", class : File },
				{ name : "method", type : "string", enum : ["md5"] }
			],
			allowExtraKeys : false,
			throwOnInvalid : true
		});
		
		return new Promise(function(resolve, reject) {
			require(["crypto-js"], function(crypto) {
				var hashReader = new FileReader();
				
				// event listener for file reader.
				hashReader.addEventListener("load", function(event) {
					var wordArray = crypto.lib.WordArray.create(hashReader.result);
					var hash = crypto.MD5(wordArray).toString();
					
					resolve(hash);
				});
				
				// Read and get Image hash
				hashReader.readAsArrayBuffer(args.file);
			});
		});
	}
	
	$.fn.sv_clientLib_eventOnce = eventOnce;
	$.fn.sv_clientLib_triggerOnce = triggerOnce;
	$.fn.sv_clientLib_eventReset = eventReset;
	
	return {
		uuid : uuid,
		removeCookie : removeCookie,
		downloadCsv : downloadCsv,
		formToObject : formToObject,
		ensureOnResize : ensureOnResize,
		getAttributes : getAttributes,
		getCookie : getCookie,
		getCookies : getCookies,
		getEvents : getEvents,
		getNodeFormData : getNodeFormData,
		getDeferredPromise : getDeferredPromise,
		hashFile : hashFile,
		initResponsive : initResponsive,
		imagesReady : imagesReady,
		inPreview : inPreview,
		isIOS : isIOS,
		isAndroid : isAndroid,
		_initLazy : _initLazy,
		_isOnScreen : _isOnScreen,
		localStorageAvailable : localStorageAvailable,
		sessionStorageAvailable : sessionStorageAvailable,
		getCallbackSeriesArray : getCallbackSeriesArray,
		PostMessenger : PostMessenger,
		UrlWatcher : UrlWatcher,
		checkCmsLogin : checkCmsLogin,
		renameAttribute : renameAttribute,
		setCookie : setCookie,
		scrollTo : scrollTo,
		StorageCache : StorageCache
	}
});