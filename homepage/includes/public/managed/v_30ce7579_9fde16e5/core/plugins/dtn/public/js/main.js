define(["jquery", "sv_urlLib", "sv_arrayLib", "sv_crmLib", "lodash", "plugins_core", "sv_asyncLib", "async", "sv_miscLib", "sv_clientLib", "exports", "jsvalidator", "site_gamClient"], function($, urlLib, arrayLib, crmLib, lodash, core, asyncLib, async, miscLib, clientLib, exports, jsvalidator, gamClient) {
	var events = $({});
	
	var localCache = new clientLib.StorageCache({ type : "localStorage", storageKey : "plugins_dtn" });
	
	var state = {
		auids : [],
		adsByAuid : {},
		waiters : {},
		firstCallMade : false
	};
	
	var _queueMockAdUnits = function() {
		var mockAdUnits = localCache.get("mockAdUnits");
		state.adsByAuid = mockAdUnits !== undefined ? arrayLib.index(mockAdUnits, "auid", true) : {};
	}
	
	_queueMockAdUnits();
	
	// extract navProps so they can be appended to calls
	var meta = $("meta[name=sv-nav-properties]");
	var navProps = meta.length > 0 ? JSON.parse($("meta[name=sv-nav-properties]").attr("content")) : {};
	
	var getAd = function(ids, cb) {
		$.ajax({
			url: "//dtnads-d.openx.net/w/1.0/arj",
			data : {
				auid : ids,
				"c.folderHref" : navProps.folderHref,
				"c.site_name" : navProps.site_name,
				"c.section" : navProps.section
			},
			dataType: "jsonp"
		}).done(function(resp) {
			cb(null, resp.ads.ad);
		}).fail(function(err) { cb(err); });
	}

	var getAdUnitsGam = function(args, cb) {
		var valid = jsvalidator.validate(args, {
			type : "object",
			schema : [
				{ name : "ids", type : "array", schema : { type : "string" }, required : true },
				// name of the model to query
				{ name : "modelName", type : "string", required : true },
				// array of fields to you want to track an OpenX click when clicked on, the URLs will still redirect to the original location
				{ name : "trackUrlFields", type : "array", schema : { type : "string" }, default : function() { return [] } },
				// a boolean column is set to help indicate downstream whether the item came from dtn, use this if you already have a column called 'dtn'
				{ name : "dtnColumn", type : "string", default : "dtn" },
				// if specified it will return the ad object on each collection item
				{ name : "adColumn", type : "string" },
				// uses this filter to be used when testing ads
				{ name : "mockFilter", type : "object" }
			],
			allowExtraKeys : false,
			required : true
		});
		
		if (valid.err) { return cb(valid.err); }

		var mockAds = false;
		
		var flow = new asyncLib.Flow();
		flow.series({
			raw : function(cb) {
				if (args.ids.length === 0) { return flow.halt(cb); }

				var calls = [];
				args.ids.forEach(function(id) {
					calls.push(function(cb) {
						// collection size always 1x1
						gamClient.getAd({ adunit : id, size : "1x1" }, cb);
					});
				});
				var adsFlow = new asyncLib.Flow();
				adsFlow.series(calls, cb);
			},
			ads : function(cb) {
				var ads = [];

				flow.data.raw.forEach(function(creative, i) {
					if (creative === undefined) { return; }
					
					try {
						creative = JSON.parse(creative);
					} catch(e) {
						console.log("Error parsing DTN ad data for", args.ids[i]);
						return undefined;
					}

					mockAds = mockAds || creative.mock === true;
					if (mockAds !== true && creative.dtnCode === undefined) {
						console.warn("Found invalid ad (not a SV Collection Ad) at index", i, args.ids[i]);
						return;
					}

					ads.push(creative);
				});

				cb(null, ads);
			},
			items : function(cb) {
				if (flow.data.ads.length === 0) { return flow.halt(cb); }

				var filter;
				var options = { limit : flow.data.ads.length };
				var token = core.simpleToken;

				if (mockAds === true) {
					filter = args.mockFilter;
				} else {
					var sortIds = flow.data.ads.map(function(val) { return val.dtnCode.id; })
					filter = { _id : { $in : flow.data.ads.map(function(val) { return { $oid : val.dtnCode.id } }) } }
				}

				$.ajax({
					method : "GET",
					cache : clientLib.inPreview() === true ? false : true,
					url : "/includes/rest_v2/" + args.modelName + "/find/",
					data : {
						json : JSON.stringify({ filter : filter, options : options }),
						token : token
					}
				}).done(function(resp) {
					var data = resp.docs;
					if (mockAds !== true) {
						data = arrayLib.sortByArray(data, "id", sortIds);
					}
					cb(null, data);
				}).fail(function(xhr, status, err) {
					return cb(err);
				});
			},
			itemMap : function(cb) {
				var map = {};
				if (mockAds === true) {
					flow.data.items.forEach(function(item, i) {
						map[item.id] = flow.data.ads[i];
					});
					return cb(null, map);
				}

				flow.data.ads.forEach(function(ad) {
					map[ad.dtnCode.id] = ad;
				});
				
				cb(null, map);
			},
			result : function(cb) {
				flow.data.items.forEach(function(item, i) {
					ad = flow.data.itemMap[item.id];

					// track the impression if available
					if (ad._impressionUrl !== undefined) {
						$("<img src='" + ad._impressionUrl + "'/>");
					}
					
					// set a column so downstream can identify what came from DTN and what didn't
					item[args.dtnColumn] = true;
					
					// ensure that all URLs will go through the click through and then redirect to the original URL
					// prepends _trackUrl to all provided fields
					if (ad._trackUrl !== undefined) {
						args.trackUrlFields.forEach(function(field, i) {
							var url = miscLib.varLookup(item, field);
							if (url !== undefined) {
								// if the url is relative url we append the current protocol and host otherwise the redirect through OpenX will fail to take them back here
								url = !url.match(/^\w+:\/\//) ? location.protocol + "//" + location.host + url : url;
								miscLib.setValue(item, field, ad._trackUrl + encodeURIComponent(url));
							}
						});
					}
					
					if (args.adColumn !== undefined) {
						item[args.adColumn] = ad;
					}
				});
				
				return cb(null, flow.data.items);
			}
		}, function(err) {
			if (err) { return cb(err); }
			
			cb(null, flow.data.result || []);
		});
	}
	
	// helper to get api items returned from OpenX ad units, primarily used with collections, but could be anything
	var getAdApiItems = function(args, cb) {
		var valid = jsvalidator.validate(args, {
			type : "object",
			schema : [
				{ name : "ids", type : "array", schema : { type : "string" }, required : true },
				// name of the model to query
				{ name : "modelName", type : "string", required : true },
				// array of fields to you want to track an OpenX click when clicked on, the URLs will still redirect to the original location
				{ name : "trackUrlFields", type : "array", schema : { type : "string" }, default : function() { return [] } },
				// a boolean column is set to help indicate downstream whether the item came from dtn, use this if you already have a column called 'dtn'
				{ name : "dtnColumn", type : "string", default : "dtn" },
				// if specified it will return the ad object on each collection item
				{ name : "adColumn", type : "string" }
			],
			allowExtraKeys : false,
			required : true
		});
		
		if (valid.err) { return cb(valid.err); }
		
		var flow = new asyncLib.Flow();
		flow.series({
			ads : function(cb) {
				if (args.ids.length === 0) { return flow.halt(cb); }
				
				getQueuedAds(args.ids, cb);
			},
			itemMap : function(cb) {
				var map = {};
				
				flow.data.ads.forEach(function(val) {
					if (val === undefined) { return; }
					
					try {
						var data = JSON.parse(val.creative[0].media);
					} catch(e) {
						console.log("Error parsing DTN ad data " + val.creative[0].media);
						return undefined;
					}
					
					map[data.id] = val;
				});
				
				cb(null, map);
			},
			items : function(cb) {
				var ids = Object.keys(flow.data.itemMap);
				
				if (ids.length === 0) {
					return flow.halt(cb);
				}
				
				var filter = { _id : { $in : ids.map(function(val) { return { $oid : val } }) } }
				var options = {}
				var token = core.simpleToken;

				$.ajax({
					method : "GET",
					cache : clientLib.inPreview() === true ? false : true,
					url : "/includes/rest_v2/" + args.modelName + "/find/",
					data : {
						json : JSON.stringify({ filter : filter }, { options : options }),
						token : token
					}
				}).done(function(resp) {
					cb(null, arrayLib.sortByArray(resp.docs, "id", ids));
				}).fail(function(xhr, status, err) {
					return cb(err);
				});
			},
			result : function(cb) {
				flow.data.items.forEach(function(val, i) {
					var ad = flow.data.itemMap[val.id];
					// track the impression
					$("<img src='" + ad.creative[0].tracking.impression + "'/>");
					
					// set a column so downstream can identify what came from DTN and what didn't
					val[args.dtnColumn] = true;
					
					// ensure that all URLs will go through the click through and then redirect to the original URL
					// ignores the ad URL set in OpenX per Tyler's guidance
					args.trackUrlFields.forEach(function(val2, i) {
						var url = miscLib.varLookup(val, val2);
						if (url !== undefined) {
							// if the url is relative url we append the current protocol and host otherwise the redirect through OpenX will fail to take them back here
							url = !url.match(/^\w+:\/\//) ? location.protocol + "//" + location.host + url : url;
							miscLib.setValue(val, val2, ad.creative[0].tracking.click + "&r=" + encodeURIComponent(url));
						}
					});
					
					if (args.adColumn !== undefined) {
						val[args.adColumn] = ad;
					}
				});
				
				return cb(null, flow.data.items);
			}
		}, function(err) {
			if (err) { return cb(err); }
			
			cb(null, flow.data.result || []);
		});
	}

	var showAd = function(elmId, auid) {
		var self = this;
		var node = $("#" + elmId);
		
		// for legacy reasons we force-cast auid to a string so we can validate as string downstream
		auid = auid.toString();
		
		queueAds([auid]);
		
		_waitForAdUnit(auid, function(err, data) {
			if (data === undefined) { return; }
			
			node.html(data.html);
			node.trigger("dtnloaded");
		});
		
		_checkRenderAds();
	}
	
	// queue ads up to be pulled the next time _renderAds() is called which will be triggered developer-facing function such as showAd(), getQueuedAds() or getAdApiItems()
	var queueAds = function(auids) {
		jsvalidator.validate(auids, {
			type : "array",
			schema : { type : "string" },
			throwOnInvalid : true
		});
		
		state.auids = state.auids.concat(auids);
	}
	
	// return the result of ads that had already been queued
	var getQueuedAds = function(auids, cb) {
		jsvalidator.validate(auids, {
			type : "array",
			schema : { type : "string" },
			throwOnInvalid : true
		});
		
		_checkRenderAds();
		
		async.mapSeries(auids, function(auid, cb) {
			_waitForAdUnit(auid, cb);
		}, cb);
	}

	var listingTracking = function(auid, node) {
		node.find("[data-dtn-beacon]").each(function(i, val) {
			var beacon = $(val);
			beacon.attr("style", "position: absolute; left: 0px; top: 0px; visibility: hidden;");
			var item = beacon.closest(".item");
			var recid = item.attr("data-recid");
			$.ajax({
				url: "//dtnads-d.openx.net/w/1.0/arj",
				data : {
					auid : auid,
					"c.listingid" : recid,
					"c.folderHref" : navProps.folderHref,
					"c.site_name" : navProps.site_name,
					"c.section" : navProps.section
				},
				dataType: "jsonp"
			}).done(function(resp) {
				if (resp.ads !== undefined && resp.ads.count !== undefined && resp.ads.count > 0) {
					beacon.html('<img src="'+ resp.ads.ad[0].creative[0].tracking.impression +'"/>');
					
					if (item.find("[data-dtn-link]").length > 0) {
						var href = item.find("[data-dtn-link]").attr("href");
						var newLink = resp.ads.ad[0].creative[0].tracking.click;
						
						// check for CRM tracking link (should be there)
						var urlObj = urlLib.parse(href);
						if (urlObj.path == "/plugins/crm/count/") {
							newLink = crmLib.getTrackUrl(urlObj.get.key, newLink);
						}
						
						item.find("[data-dtn-link]").attr("href", newLink);
					}
				}
			});
		});
	}
	
	// fake the return of ad content before dtn has fully implemented the ad content
	// passing media : "<img src='x'>" will fake it with an img item or any arbitrary html
	// passing media : JSON.stringify({ id : mongoId }) will fake it with a collection/api item for use get getAdApiItems
	var mockAdUnits = function(adunits) {
		jsvalidator.validate(adunits, {
			type : "array",
			schema : {
				type : "object",
				schema : [
					{ name : "auid", type : "string", required : true },
					{ name : "media", type : "string", required : true }
				],
				allowExtraKeys : false,
			},
			throwOnInvalid : true,
			required : true
		});

		var adid = 0;

		var ads = adunits.map(function(val) {
			return {
				adid : adid++,
				auid : val.auid,
				creative : [
					{
						media : val.media,
						tracking : {
							click : "/plugins/dtn/mock_tracking/?type=click&auid=" + val.auid,
							impression : "/plugins/dtn/mock_tracking/?type=impression&auid=" + val.auid
						}
					}
				],
				html : val.media
			}
		});
		
		localCache.set("mockAdUnits", ads);
	}
	
	var clearMockAdUnits = function() {
		localCache.remove("mockAdUnits");
	}
	
	// loop ove all ad units and waiters and match the two together
	var _callWaiters = function() {
		Object.keys(state.adsByAuid).forEach(function(key) {
			var ads = state.adsByAuid[key];
			var waiters = miscLib.varLookup(state, ["waiters", key]);
			
			// while we have waiters and ads, pop them off the front of the arrays and execute
			while(state.adsByAuid[key].length > 0 && waiters !== undefined && waiters.length > 0) {
				var ad = ads.shift();
				var waiter = waiters.shift();

				waiter(null, ad);
			}
		});
	}
	
	// register a callback that will wait for an ad in the requested ad unit
	var _waitForAdUnit = function(auid, cb) {
		state.waiters[auid] = state.waiters[auid] || [];
		state.waiters[auid].push(cb);

		_callWaiters();
	}
	
	// if firstCall hasn't been made yet, it does nothing, if it's already been made then we need to execute
	// this ensures that endpoints requesting ads are able to load them even if they occur later than the first load
	var _checkRenderAds = function() {
		if (state.firstCallMade === true) { _renderAds(); }
	}

	var _renderAds = function() {
		state.firstCallMade = true;
		var auids = state.auids.splice(0);
		
		var flow = new asyncLib.Flow();
		flow.series({
			ads : function(cb) {
				if (auids.length === 0) { return flow.halt(cb) }
				
				getAd(auids.join(","), function(err, ads) {
					// intentionally ignoring errors so that waiters are still called in case of adblocker or dtn down
					cb(null, ads || []);
				});
			},
			result : function(cb) {
				var adIndex = arrayLib.index(flow.data.ads, "adunitid", true);
				
				// stash all of the returned ads on our state object
				auids.forEach(function(val, i) {
					// in the event that less ads are returned than adunitsids, this pop() will returned undefined, that is intentional
					// openx didn't have an ad to return so the ad area needs to be blank and not hang waiting for a cb
					adIndex[val] = adIndex[val] || [];
					var ad = adIndex[val].pop();
					
					state.adsByAuid[val] = state.adsByAuid[val] || [];
					state.adsByAuid[val].push(ad);
				});

				_callWaiters();
				
				cb(null);
			}
		}, function(err) {
			if (err) { throw err; }
			
			events.trigger("renderAds");
		});
	}
	
	exports.clearMockAdUnits = clearMockAdUnits;
	exports.events = events;
	exports.getAd = getAd;
	exports.getAdUnitsGam = getAdUnitsGam; // GAM version of getAdApiItems()
	exports.getAdApiItems = getAdApiItems;
	exports.getQueuedAds = getQueuedAds;
	exports.listingTracking = listingTracking;
	exports.mockAdUnits = mockAdUnits;
	exports.queueAds = queueAds;
	exports.showAd = showAd;
	exports._queueMockAdUnits = _queueMockAdUnits; // private function used for unit testing
	exports._renderAds = _renderAds; // private function for use by dtnloader
	exports._state = state; // private state variable for unit testing
});