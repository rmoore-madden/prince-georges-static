define(["jquery", "sv_site", "sv_cloudinaryLib/default","sv_stringLib","sv_clientMoment","sv_videoLib"], function($, sv_site, cloudinary, stringLib, clientMoment, videoLib) {
	var self = {
		// Set up placeholder image
		placeholderAsset : { 
			resource : cloudinary.createResource({
				imageUrl : sv_site.siteConfig.custom.placeholderImageUrl
			})
		},
		init: function(data) {
			var data = data || {};
			var source = data.source === 'feed' ? data.feed : 'slides';

			var formattedDate = function(fmt, offersPrefix) {
				var fmt = fmt || "LL";

				if (source === 'plugins_offers_offers') {
					var offersPrefix = offersPrefix || "Valid: ";
					if (this.startDate && this.endDate) {
						return offersPrefix + this.startDate.format(fmt) + ' - ' + this.endDate.format(fmt);
					} else if (!this.startDate && this.startDate) {
						return offersPrefix + 'Ending ' + this.startDate.format(fmt);
					} else if (!this.endDate && this.endDate) {
						return offersPrefix + 'Starting ' + this.endDate.format(fmt);
					}
					return offersPrefix + "Always";
				} else if (this.startDate) {
					return this.startDate.format(fmt) + (this.endDate ? ' - ' + this.endDate.format(fmt) : "");
				}
			};

			var plainDescription = function(limit, options) {
				var options = options || { ellipsis: true };
				var nohtml = stringLib.stripHtml(this.description);
				return  limit ? stringLib.substringOnWord(nohtml, limit, options) : nohtml;
			};

			// Clean up feed data
			data.items.forEach(function(item) {
				// Find all uninitialized cloudinary resources and initialize them
				for (var prop in item) {
					if (item[prop] && item[prop].resource && (item[prop].resource.imageUrl || item[prop].resource.raw)) {
						item[prop].resource = cloudinary.createResource(item[prop].resource); 
						if (item[prop].type === "video" && item[prop].videotype) {
							item[prop].videoresource = new videoLib.Resource({id : item[prop].videoid, type : item[prop].videotype});
						} else if (item[prop].type === "video") {
							// Fix for media gallery albums. This is for all intents and purposes only an image.
							// It shouldn't be displayed as video and that's why its lacking the rest of the video information.
							item[prop].type = "image";
						}
					}
				}
				// Intialize momement objects
				if (item.startDate) item.startDate = clientMoment(item.startDate);
				if (item.nextDate) item.nextDate = clientMoment(item.nextDate);
				if (item.endDate) item.endDate = clientMoment(item.endDate);

				// Add a helper boolean to let us know if we have dates
				var dateCollections = ['plugins_events_events', 'plugins_offers_offers'];
				item.hasDates = dateCollections.indexOf(source) > -1 || (item.startDate || item.endDate);

				// Add date and description format helper to item
				item.formattedDate = formattedDate;
				item.plainDescription = plainDescription;
			});

			return data;
		}

	};
	return self;
});