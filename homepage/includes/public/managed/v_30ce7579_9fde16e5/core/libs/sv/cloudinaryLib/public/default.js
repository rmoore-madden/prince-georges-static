define(["jquery", "cloudinary", "./Cloudinary", "sv_site"], function($, cloudinary, Cloudinary, sv_site) {
	// create default cloudinary singleton
	return new Cloudinary({ cloudinary : $.cloudinary, extend : $.extend, sv_site : sv_site});
});