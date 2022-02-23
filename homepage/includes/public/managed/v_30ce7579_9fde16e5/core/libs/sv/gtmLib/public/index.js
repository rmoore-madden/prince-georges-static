define(function(require, exports, module) {
	var $ = require("jquery");
	var lodash = require("lodash");
	var validator = require("@sv/validator");
	
	var GTM = function(args) {
		var self = this;
		
		args = args || {};
		
		validator.validate(args, {
			type : "object",
			schema : [
				{ name : "dataLayerName", type : "string", default : "gtmDataLayer", regex : /^[A-Za-z0-9_]+$/ },
				{ name : "addArgs", type : "object", default : function() { return {} } },
				{ name : "sendEventsHook", type : "function", default : function() { return function(args) { return args; } } },
				{ name : "namespace", type : "string", default : "gtm" }
			],
			allowExtraKeys : false,
			throwOnInvalid : true
		});
		
		self._args = args;
		
		self._dataLayer = window[self._args.dataLayerName] = window[self._args.dataLayerName] || [];
		self._onclickBoundAttr = "data-" + self._args.namespace + "-onclick-bound";
		self._clickDataAttr = "data-" + self._args.namespace + "-click";
		self._clickDataSelector = "["+self._clickDataAttr+"]";
		self._clickDocumentSelector = self._clickDataSelector + "[" + self._onclickBoundAttr + "!=true]";
		self._clickDocumentEvent = "click.gtmLib_" + self._args.namespace;
		self._varsDataAttr = "data-" + self._args.namespace + "-vars";
		self._varsDataCollectedAttr = self._varsDataAttr + "-collected";
		self._varsDataSelector = "["+self._varsDataAttr+"]";
		self._triggerRegex = /^(tClient|tCore|tClient_[a-zA-Z0-9_]+|tCore_[a-zA-Z0-9_]+)$/;
		self._highlightInited = false;
		
		self._documentHandler = function(event) {
			self._handleClick($(this), "document", event);
		};
		
		$(document).off(self._clickDocumentEvent).on(self._clickDocumentEvent, self._clickDocumentSelector, self._documentHandler);
	};
	
	// returns the html of just the opening part of the element that includes the data-gtm declarations, needed for debugging
	GTM.prototype._getSnippet = function(node) {
		var self = this;
		
		return node.get(0).outerHTML.replace(/>[\s\S]*/, '>');
	};
	
	GTM.prototype._getClickArgs = function(node) {
		var self = this;
		
		var clickArgs = self._getAttrData(node, self._clickDataAttr);
		if (clickArgs instanceof Error) {
			return new Error("Invalid JSON in " + self._clickDataAttr + " on element " + self._getSnippet(node) + ".");
		}
		
		clickArgs = clickArgs || {};
		
		var valid = validator.validate(clickArgs, {
			type : "object",
			schema : [
				{ name : "inherit", type : "boolean", default : true },
				{ name : "collect", type : "boolean" },
				{ name : "follow", type : "boolean" },
				{ name : "onclick", type : "boolean" }
			],
			allowExtraKeys : false
		});
		
		if (valid.err) {
			return new Error("Invalid keys in " + self._clickDataAttr + " on element " + self._getSnippet(node) + ". " + valid.err.message);
		}
		
		return clickArgs;
	};
	
	GTM.prototype._getVars = function(args) {
		var self = this;
		
		args = args || {};
		
		validator.validate(args, {
			type : "object",
			schema : [
				{ name : "node", type : "class", class : $, required : true },
				{ name : "inherit", type : "boolean", required : true }
			],
			allowExtraKeys : false,
			throwOnInvalid : true
		});
		
		if (args.node.length !== 1) {
			return new Error("Expected 1 node, but received " + args.node.length);
		}
		
		// create nodes object in order of top level element down to node
		var nodes = $();
		
		if (args.inherit === true) {
			var collectedData = self._getAttrData(args.node, self._varsDataCollectedAttr);
			if (collectedData instanceof Error) {
				return collectedData;
			}
			
			if (collectedData !== undefined) {
				// we have already collected data, simply return it
				return collectedData;
			}
			
			// if we are doing inheritance, add the parent ancestry
			nodes = nodes.add(args.node.parents(self._varsDataSelector));
		}
		
		// our node should be last so add it at the end
		nodes = nodes.add(args.node);
		
		var data = [true, {}];
		var errors = [];
		
		nodes.each(function(i, val) {
			var node = $(val);
			var attrData = self._getAttrData(node, self._varsDataAttr) || {};
			if (attrData instanceof Error) {
				errors.push("Invalid JSON in '" + self._varsDataAttr + "' on element " + self._getSnippet(node) + ".");
				return true;
			}
			
			var err = self._validateVarData(attrData);
			if (err instanceof Error) {
				errors.push("Invalid var data in '" + self._varsDataAttr + "' on element " + self._getSnippet(node) + ". " + err.message);
				return true;
			}
			
			attrData = self._decodeVars(attrData);
			if (attrData instanceof Error) {
				errors.push(attrData.message);
				return true;
			}
			
			data.push(attrData);
		});
		
		if (errors.length > 0) {
			return new Error(errors.join(" "))
		}
		
		var mergedData = $.extend.apply(null, data);
		
		// using the last object in the list we can determine what the valid triggers are for this object
		var validTriggers = Object.keys(data[data.length - 1]);
		
		$.each(mergedData, function(i, val) {
			if (validTriggers.indexOf(i) === -1) {
				delete mergedData[i];
			}
		});
		
		return mergedData;
	};
	
	GTM.prototype._encodeVars = function(data) {
		var self = this;
		
		Object.keys(data).forEach(function(event) {
			Object.keys(data[event]).forEach(function(key) {
				if (typeof data[event][key] !== "string") { return; }
				
				data[event][key] = encodeURIComponent(data[event][key]);
			});
		});
		
		return data;
	}
	
	GTM.prototype._decodeVars = function(data) {
		var self = this;
		
		var err;
		
		var valid = Object.keys(data).every(function(event, i2) {
			return Object.keys(data[event]).every(function(key, i3) {
				if (typeof data[event][key] !== "string") { return true; }
				
				try {
					data[event][key] = decodeURIComponent(data[event][key]);
				} catch (e) {
					err = new Error("Data at '" + event + "." + key + "' was not properly percent encoded with encodeURIComponent or goatee's {{%%key}}");
					return false;
				}
				
				return true;
			});
		});
		
		if (err) {
			return err;
		}
		
		return data;
	}
	
	GTM.prototype._handleClick = function(node, type, event) {
		var self = this;
		
		var vars = self._getAndPrepareNode(node);
		if (vars instanceof Error) {
			event.preventDefault();
			event.stopImmediatePropagation();
			throw vars;
		}
		
		// we know this can't return an error since getAndPrepare already checks it
		var clickArgs = self._getClickArgs(node);
		
		var href = node.attr("href");
		var follow = (href !== undefined && clickArgs.follow === true);
		
		if (follow) {
			// if following we need to preventDefault() so that it will wait for the async send to GA to complete
			// if you return false or stopImmediatePropagation, you stop the event bubble
			event.preventDefault();
		}
		
		self._sendEvents(vars, type, function() {
			if (follow) {
				// if we are following, set the window.location
				window.location = href;
			}
		});
	};
	
	GTM.prototype._getAndPrepareNode = function(node) {
		var self = this;
		
		var clickArgs = self._getClickArgs(node);
		if (clickArgs instanceof Error) { return clickArgs; }
		
		var vars = self._getVars({ node : node, inherit : clickArgs.inherit });
		if (vars instanceof Error) { return vars; }
		
		vars = self._prepareEvents(vars);
		if (vars instanceof Error) { return vars; }
		
		return vars;
	}
	
	// takes the entire page and scrapes all elements on it that have click tracking
	// this allows a report to be built based on all click handlers on the page
	GTM.prototype.scrape = function() {
		var self = this;
		
		var results = {
			errors : [],
			valid : []
		};
		
		$(self._clickDataSelector).each(function(i, val) {
			var vars = self._getAndPrepareNode($(this));
			var isErr = vars instanceof Error;
			results[isErr ? "errors" : "valid"].push({
				node : $(this),
				el : this, // return the element so that hovering in the console window highlights the div
				data : vars
			});
		});
		
		return results;
	}
	
	// highlight all dom nodes which have click handlers bound to them. Allows easy debugging by highlighting the elements
	// shows the data they will transmit on hover
	GTM.prototype.highlight = function() {
		var self = this;

		if (self._highlightInited === true) {
			return;
		}

		self._highlightInited = true;

		function addOutline() {
			var temp = self.scrape();
		
			$(self._clickDataSelector).css({ outline : "2px solid green" });
			
			temp.errors.forEach(function(val) {
				val.node.css({ outline : "2px solid red" });
			});
		}

		var helper = $("<div data-gtm-highlighter></div>");
		helper.css({
			display  : "none",
			position : "fixed",
			padding : "5px",
			background : "#fff",
			color : "#000",
			fontSize : "11px",
			boxShadow : "0px 1px 5px #444",
			zIndex : 99999
		});

		$("body").append(helper);

		$("body").on("mouseenter", self._clickDataSelector, function(e) {
			var vars = self._getAndPrepareNode($(this));
			
			helper.html(vars instanceof Error ? vars.message : JSON.stringify(vars, null, " "));
			helper.show().css({ left : e.clientX + 15, top : e.clientY + 15 });
		});

		$("body").on("mouseleave", self._clickDataSelector, function() {
			helper.hide();
		});

		addOutline();

		var observer = new MutationObserver(lodash.debounce(addOutline), 100);
		observer.observe(window.document.documentElement, { childList: true, subtree: true });
	}
	
	// update ensures that elements which have collect and/or onclick will be able to properly execute
	// in the event of malformed arg data, update() will not throw, instead it will console.log() and continue to the next element
	GTM.prototype.update = function(args) {
		var self = this;
		
		args = args || {};
		
		validator.validate(args, {
			type : "object",
			schema : [
				{ name : "node", type : "class", class : $, default : $(document) }
			],
			allowExtraKeys : false,
			throwOnInvalid : true
		});
		
		// if passed in a node, we want to update that node and all of it's children
		// this way if collect is on a child node it will be updated
		var nodes = args.node.add(args.node.find(self._clickDataSelector));
		
		nodes.each(function(i, val) {
			var node = $(val);
			
			var clickArgs = self._getClickArgs(node);
			if (clickArgs instanceof Error) {
				self._log(clickArgs);
				return true;
			}
			
			if (clickArgs.collect === true && clickArgs.inherit === true) {
				node.removeAttr(self._varsDataCollectedAttr); // clear out previously collected data
				
				var collectedData = self._getVars({ node : node, inherit : clickArgs.inherit });
				if (collectedData instanceof Error) {
					self._log(collectedData);
					return true;
				}
				
				self._setAttrData(node, self._varsDataCollectedAttr, collectedData);
			}
			
			if (clickArgs.onclick === true && node.attr(self._onclickBoundAttr) === undefined) {
				if (node.attr("onclick") !== undefined) {
					// if the element already has an onclick not related to gtm we need to log because both can't exist
					self._log(new Error("non-gtmLib onclick already exists on element " + self._getSnippet(node) + "."));
					return true;
				}
				
				node.data("sv_gtmLib_" + self._args.namespace, self);
				node.attr(self._onclickBoundAttr, true);
				node.attr("onclick", "return $(this).data('sv_gtmLib_" + self._args.namespace + "')._handleClick($(this), 'onclick', event || window.event);"); // event || window.event for < IE9
			}
		});
	};
	
	GTM.prototype._prepareEvents = function(events) {
		var self = this;
		
		$.each(events, function(i, val) {
			// fold in addArgs for each trigger, do not overwrite existing keys
			events[i] = $.extend({}, self._args.addArgs[i] || {}, val);
		});
		
		// execute the sendEventsHook
		var returnData = self._args.sendEventsHook(events);
		
		if (typeof returnData !== "object") {
			return new Error("sendEventsHook must return args object");
		}
		
		// validate after both are done we still have valid data
		var err = self._validateVarData(returnData);
		if (err instanceof Error) {
			return err;
		}
		
		return returnData;
	}
	
	GTM.prototype.sendEvents = function(events, cb) {
		var self = this;
		
		cb = cb || function(err) {
			if (err) { throw err; }
		}
		
		var events = self._prepareEvents(events);
		if (events instanceof Error) {
			return cb(events);
		}
		
		self._sendEvents(events, "sendEvents", cb);
	};
	
	GTM.prototype._sendEvents = function(events, type, cb) {
		var self = this;
		
		var pushArr = [];
		var cbCount = 0;
		
		var done = function() {
			cb(null);
			
			// only for unit testing, DO NOT USE in production. Must come after cb so that follow can occur before this
			$(window).trigger("gtmLib_eventCallback", { gtm : self, type : type, events : events });
		};
		
		var eventCallback = function() {
			cbCount++;
			
			if (cbCount === pushArr.length) {
				done();
			}
		};
		
		$.each(events, function(eventName, eventObj) {
			pushArr.push({
				event : eventName,
				// append a callback so that we can guarantee the tracking is completed before the browser navigates away
				eventCallback : eventCallback,
				// namespace all keys in GTM except "event" and "eventCallback" under "sv." to make it easy to identify our variables in GTM from native variables
				// this also allows us to empty out the sv object between pushes to prevent persistence
				sv : eventObj
			});
		});
		
		if (pushArr.length === 0) {
			// bounce off the event loop to ensure this function is async always
			return setTimeout(done, 0);
		}
		
		pushArr.forEach(function(val) {
			self._dataLayer.push(val);
			
			// we need to empty out the sv part of the data layer between pushes that way variables don't persist between the pushes
			self._dataLayer.push({ sv : undefined });
		});
	};
	
	// returns the vars for a single node for all triggers
	GTM.prototype.getVars = function(args) {
		var self = this;
		
		args = args || {};
		
		validator.validate(args, {
			type : "object",
			schema : [
				{ name : "node", type : "class", class : $, required : true },
				{ name : "inherit", type : "boolean", default : false }
			],
			allowExtraKeys : false,
			throwOnInvalid : true
		});
		
		var data = self._getVars({ node : args.node, inherit : args.inherit });
		if (data instanceof Error) {
			throw data;
		}
		
		return data;
	};
	
	// sets the vars for a single node for all triggers
	GTM.prototype.setVars = function(args) {
		var self = this;
		
		args = args || {};
		
		validator.validate(args, {
			type : "object",
			schema : [
				{ name : "node", type : "class", class : $, required : true },
				{ name : "data", type : "object", required : true }
			],
			allowExtraKeys : false,
			throwOnInvalid : true
		});
		
		var err = self._validateVarData(args.data);
		if (err instanceof Error) {
			throw new Error(err);
		}
		
		args.data = self._encodeVars(args.data);
		self._setAttrData(args.node, self._varsDataAttr, args.data);
		self.update({ node : args.node });
	};
	
	// sets or increments a single var for a single node for a single trigger
	GTM.prototype.setVar = function(args) {
		var self = this;
		
		args = args || {};
		
		validator.validate(args, {
			type : "object",
			schema : [
				{ name : "node", type : "class", class : $, required : true },
				{ name : "trigger", type : "string", required : true },
				{ name : "key", type : "string", required : true },
				{ name : "value", type : "any" },
				{ name : "inc", type : "number" } // if "inc" is passed, ignore "value"
			],
			allowExtraKeys : false,
			throwOnInvalid : true
		});
		
		var data = self._getVars({ node : args.node, inherit : false });
		if (data instanceof Error) {
			throw data;
		}
		
		var trigger = data[args.trigger] = data[args.trigger] || {};
		if (args.inc !== undefined) {
			// default the value of the trigger to 0 if it doesn't exist
			trigger[args.key] = (trigger[args.key] !== undefined) ? trigger[args.key] : 0;
			
			if (typeof trigger[args.key] !== 'number') {
				throw new Error("Cannot increment '" + args.key + "', previous value '" + trigger[args.key] + "' not a number.");
			}
			
			trigger[args.key] += args.inc; 
		} else if (args.value === undefined) {
			delete trigger[args.key];
		} else {
			trigger[args.key] = args.value;
		}
		
		self.setVars({ node : args.node, data : data });
	};
	
	// read an attribute and convert from JSON to object
	GTM.prototype._getAttrData = function(node, attr) {
		var self = this;
		
		var attrData = node.attr(attr);
		var returnData;
		
		if (attrData === undefined || attrData === "") { return; }
		
		try {
			returnData = JSON.parse(attrData);
		} catch (e) {
			returnData = e;
		}
		
		return returnData;
	}
	
	// set an attribute from object to JSON
	GTM.prototype._setAttrData = function(node, attr, data) {
		var self = this;
		
		node.attr(attr, JSON.stringify(data));
	}
	
	GTM.prototype._validateVarData = function(data) {
		var self = this;
		
		var err;
		
		$.each(data, function(trigger, val) {
			if (trigger.match(self._triggerRegex) === null) {
				err = new Error("Invalid trigger name '" + trigger + "'.");
				return false;
			}
		});
		
		return err;
	}
	
	// wrapper for console.log allowing easier monkey-patching in unit tests
	GTM.prototype._log = function(str) {
		console.log(str);
	}
	
	module.exports = {
		GTM : GTM
	}
});