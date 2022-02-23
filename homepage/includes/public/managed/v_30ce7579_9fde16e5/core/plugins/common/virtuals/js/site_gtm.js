define(["jquery", "sv_gtmLib", "sv_site", "module"], function($, sv_gtmLib, site, module) {
	// initialize GTM with specific arguments
	var args = $.extend(true, {}, module.config().coreArgs, {
		// add client specific args here
	});
	
	var gtmObj = new sv_gtmLib.GTM(args);

	gtmObj.trackMapMarkers = function(mapContainer, cb) {
		if (!mapContainer.length > 0) return; 
		var cb = cb || function(){};
		var map = $(mapContainer);
		var currentWindow = "";
		map.off("click").on("click", function(event){
			setTimeout(function(){
				/* since we arent using google map objects we cannot bind to their events, hence the timeout
				   to allow info window to show. If we were using Marker() object we could just simply bind to the marker click */
				var infoWindow = map.find(".infoWindow");
				if($(event.target).is('div') || $(event.target).is('a') || !infoWindow.length > 0){
					return;
				}
				var gtmVars = JSON.parse(infoWindow.attr("data-gtm-vars"));
				if(currentWindow == gtmVars.tClient['eventLabel']) { 
					return; 
				}
				currentWindow = gtmVars.tClient['eventLabel'];
				gtmVars.tClient['eventAction'] = "Map Pin Click";
				gtmVars.tClient['eventLabel'] = decodeURIComponent(gtmVars.tClient['eventLabel']);
				gtmVars.tClient['lt'] = "InfoWindow";
				gtmVars.tClient['ot'] = "Map Pin";
				gtmVars.tClient['vt'] = "Results";
				gtmVars.tClient['ua'] = "Click";
				cb(gtmVars);
			}, 40);
		});
	}

	return gtmObj;
});