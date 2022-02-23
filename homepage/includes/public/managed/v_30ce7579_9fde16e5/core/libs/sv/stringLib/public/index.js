// umd boilerplate for CommonJS and AMD
if (typeof exports === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var crypto = require("crypto");

	var cheerio = require("cheerio");
	var he = require("he");

	var hash = function(str) {
		return crypto.createHash("md5").update(str).digest("hex");
	}

	// generate a random string of a variable length using a-zA-Z0-9
	// this is good for generating random passwords but generally not a good idea in areas where collisions can occur such as hashing/guid
	var randomString = function(len) {
		var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
		
		var result = "";
		
		for(var i = 0; i < len; i++) {
			result += chars.charAt(Math.floor(Math.random() * (chars.length - 1 - 0 + 1) + 0));
		}
		
		return result;
	}

	var formatLineBreaks = function(str) {
		// replace different line break characters with a single br tag
		return str.replace(/(?:\r\n|\r|\n)/g, "<br/>");
	}
	
	var formatCityStateZip = function(args) {
		// args.city
		// args.state
		// args.zip
		
		var stateZip = [];
		var city = [];
		
		if (args.state) {
			stateZip.push(args.state);
		}
		
		if (args.zip) {
			stateZip.push(args.zip);
		}
		
		if (args.city) {
			city.push(args.city);
		}
		
		if (stateZip.length > 0) {
			city.push(stateZip.join(" "));
		}
		
		return city.join(", ");
	}

	/**
	 * Returns a substring splitting ONLY a space character. If there is no space
	 * character to split on, return and empty string. 
	 */

	function substringOnWord(text, limit, opts) {
		opts = opts || {};
		// opts.ellipsis - appends ellipsis in the event the string is trimmed
		
		if (text === undefined || text.length === undefined) return text;
		
		limit = Math.min(limit, text.length);

		// We don't need to split. You have the full string!
		if (limit === text.length) return text;

		while (limit !== 0 && text[limit] !== " ") {
			limit--;
		}

		var newString = text.substring(0, limit);

		// append an ellipsis to the string
		if(opts.ellipsis && newString !== "") return newString + '...';

		return newString;
	}

	var htmlSubstring = function(html, limit) {
		if (html.length <= limit) { return html; }
		
		// we only want to count characters you can see so &amp; should really be just & and double spaces are rendered as one space
		html = he.decode(html);
		html = html.replace(/\s+/g," ").trim();
		
		var incBuffer = true;
		var inTag = false;
		var newData = "";
		var bufferData = "";
		var validTotal = 0;
		var validCount = 0;
		var i = 0;
		var len = html.length;
		
		for (i = 0; i < len; i++) {
			incBuffer = true;
			
			if (html[i] === "<") {
				// opening an html tag
				inTag = true;
			} else if (html[i] === ">") {
				// closing an html tag
				inTag = false;
			} else if (html[i] === " " && inTag === false) {
				// hit a space, allowing us to accept buffer items into our string
				validTotal += validCount;
				validCount = 1;
				newData += bufferData;
				bufferData = html[i];
				incBuffer = false;
			} else if (inTag === false) {
				// if not in a tag increase the character count
				validCount++;
			}
			
			if (incBuffer === true) {
				bufferData += html[i];
			}
			
			if (validCount + validTotal > limit) {
				// we have more characters to add than the limit will accept, empty the buffer and break
				bufferData = "";
				break;
			}
		}
		
		// concat the remaining buffer, convert to string
		var newDataString = (newData + bufferData).trim();
		
		// process the string into dom elements, closing open tags
		var html = cheerio('<div>'+newDataString+'</div>').html();
		
		// should return html with non-ASCII characters entity encoded
		// this allows us to return html containing &, <, >, ", ', and `, othwerise the content would be entity encoded
		return he.encode(html, { allowUnsafeSymbols : true });
	}
	
	// create a regex to handle greedy matching for the tags outlined below, otherwise comments, tags, tags left open and then trailing < > left behind
	var _blockTags = ['head', 'title', 'style', 'script', 'noscript', 'textarea', 'iframe', 'embed', 'object', 'canvas'];
	var _blockMatch = _blockTags.map(function(val) { return "<"+val+"[\\s\\S]*?>[\\s\\S]*?</"+val+">" });
	// match comments any then any characters
	var _commentMatch = "<!--[\\s\\S]*?-->";
	// match tags which might start with /, have a name and then have attributes until a close tag
	var _genericTagMatch = "<\/?([\\w-]+)[\\s\\S]*?>";
	// match tags which might start with /, have a name, but then lookahead to make sure we hit a < or $ before we hit a >.
	// Since it's a lookahead we still only capture/replace the inital tag
	var _brokenMatch = "<\/?[\\w-]+(?=[^>]*?(?:<|$))";
	// default removes block tags, broken tags, html comments, and generic tags
	var _defaultMatchArray = _blockMatch.concat(_brokenMatch, _commentMatch);
	var _defaultRegex = new RegExp(_defaultMatchArray.concat(_genericTagMatch).join("|"), "g");
	var _inlineTags = ["a", "span", "b", "strong", "i"];
	
	function stripHtml(str, args) {
		if (str === undefined || str === "") { return ""; }
		
		args = args || {};
		
		// pre-lowercase all HTML tags which contain an upper-case letter
		str = str.replace(/<\/?\w*[A-Z]\w*[\s\>]/g, function(match) {
			return match.toLowerCase();
		});
		
		// remove tags, strips out the contents of a specific set of tags declared above, otherwise just removes start and end tags
		var regex = _defaultRegex;
		
		if (args.allowTags !== undefined) {
			// instead of the _genericTagMatch we build our own with a negative lookahead to exclude matching tags we allow, since a match would remove it
			var allowTagsMatch = "<(?!\\/?(" + args.allowTags.join("|") + ")(>|\\s))\/?[\\w-]+[\\s\\S]*?>";
			regex = new RegExp(_defaultMatchArray.concat(allowTagsMatch).join("|"), "g");
		}
		
		str = str.replace(regex, function(tag, tagName) {
			if (_inlineTags.indexOf(tagName) > -1) {
				return "";
			} else {
				return " ";
			}
		});
		
		return str.replace(/\s+/g, " ").trim();
	}
	
	function getExtension(str) {
		// remove everything past the ? to strip query, remove everything before the final /, then grab the content after the last dot
		var temp = str.replace(/\?.*/, "").replace(/.*\//, "").match(/\.([^\.]+)$/);
		
		return temp !== null ? temp[1] : "";
	}
	
	function encodeScriptTags(str) {
		return str.replace(/<((sv_)*)script/g, "<$1sv_script").replace(/<\/((sv_)*)script/g, "</$1sv_script");
	}
	
	function decodeScriptTags(str) {
		return str.replace(/<((sv_)*)sv_script/g, "<$1script").replace(/<\/((sv_)*)sv_script/g, "</$1script");
	}
	
	function escapeRegex(str) {
		// from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
		return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
	}
	
	function ensureProtocol(url) {
		if (url.match(/^(http|https):\/\//) === null) {
			return "http://" + url;
		} else {
			return url;
		}
	}
	
	// unicode safe base64 encode/decode, identical output in browser/node
	function base64Encode(str) {
		var btoa = (typeof window !== 'undefined') ? window.btoa : function(str) {
			return Buffer.from(str, "binary").toString("base64");
		}
		
		var step1 = encodeURIComponent(str);
		var step2 = unescape(step1);
		var step3 = btoa(step2);
		
		return step3;
	}
	
	function base64Decode(str) {
		var atob = (typeof window !== 'undefined') ? window.atob : function(str) {
			return Buffer.from(str, "base64").toString("binary");
		}
		
		var step1 = atob(str);
		var step2 = escape(step1);
		var step3 = decodeURIComponent(step2);
		
		return step3;
	}
	
	var _encodeHtml_map = {
		"&" : "&amp;",
		"<" : "&lt;",
		">" : "&gt;",
		"'" : "&apos;",
		'"' : "&quot;"
	};
	var _encodeHtml_regex = new RegExp("(" + Object.keys(_encodeHtml_map).join("|") +")", "g");
	var _encodeHtml_replace = function(char) {
		return _encodeHtml_map[char];
	}
	
	function encodeHtml(str) {
		if (str === undefined) { return ""; }
		
		return str.replace(_encodeHtml_regex, _encodeHtml_replace);
	}
	
	// ensures that a header doesn't contain out of range characters which can cause Node to crash
	function headerValidInNode(str) {
		// invalid ranges char codes: 0 - 8, 10 - 31, 127, 256+
		// (num).toString(16) convert charCode to unicode value
		return /[\u0000-\u0008\u000a-\u001f\u007f\u0100-\uffff]/.test(str) === false;
	}

	function htmlToAmp(html) {
		if (html === undefined) { return ""; }
		
		var dom = cheerio.load(html, { decodeEntities : false });

		var ampStripTags = ["script", "style", "input[type=image]", "input[type=button]", "input[type=password]", "input[type=file]", "iframe", "video", "audio", "meta"];
		var ampStripAttributes = ["border"];

		// strip invalid tags
		dom(ampStripTags.join(",")).remove();

		// amp images (prefix + dimensions)
		dom("img").each(function(i, el) {
			var el = dom(el);
			// read height and width from width="x" style="width: x" or data-width="x"
			var height = parseInt(el.attr("height") || el.css("height") || el.attr("data-height"), 10) || undefined;
			var width = parseInt(el.attr("width") || el.css("width") || el.attr("data-width"), 10) || undefined;
			
			if (height === undefined || width === undefined) {
				return el.remove();
			}
			
			el.attr("width", width);
			el.attr("height", height);
			el.attr("layout", "responsive");
			el.addClass("htmlToAmp"); // add a class to allow people to target elements transformed in this way

			this.name = "amp-" + this.name;
		});

		// Strip invalid attributes - do this last since we use steal image dimensions from this
		ampStripAttributes.forEach(function(attr) {
			dom("[" + attr + "]").removeAttr(attr);
		});

		return dom.html();
	}

	module.exports = {
		hash : hash,
		randomString : randomString,
		formatLineBreaks : formatLineBreaks,
		formatCityStateZip : formatCityStateZip,
		substringOnWord : substringOnWord,
		headerValidInNode : headerValidInNode,
		encodeHtml : encodeHtml,
		htmlSubstring : htmlSubstring,
		stripHtml : stripHtml,
		getExtension : getExtension,
		encodeScriptTags : encodeScriptTags,
		decodeScriptTags : decodeScriptTags,
		escapeRegex : escapeRegex,
		ensureProtocol : ensureProtocol,
		base64Encode : base64Encode,
		base64Decode : base64Decode,
		htmlToAmp : htmlToAmp
	}
});