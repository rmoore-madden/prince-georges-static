// umd boilerplate for CommonJS and AMD
if (typeof exports === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var Resource = require("./Resource");
	
	var parseVideoUrl = function(url) {
		var formats = [
			{ type : "youtube", regex : /https?:\/\/www\.youtube\.com\/watch\?v=(.*?)(&|$)/ },
			{ type : "youtube", regex : /https?:\/\/www\.youtube\.com\/embed\/(.*)/ },
			{ type : "youtube", regex : /https?:\/\/youtu\.be\/(.*)/ },
			{ type : "vimeo", regex : /https?:\/\/vimeo\.com\/(.*)/ },
			{ type : "vimeo", regex : /https?:\/\/player\.vimeo\.com\/video\/(.*)/ }
		]
		
		var result = { success : false };
		
		formats.some(function(val, i) {
			var match = url.match(val.regex);
			
			if (match !== null) {
				result = { success : true, id : match[1], type : val.type }
				return true;
			}
		});
		
		return result;
	}
	
	module.exports = {
		parseVideoUrl : parseVideoUrl,
		Resource : Resource
	}
});