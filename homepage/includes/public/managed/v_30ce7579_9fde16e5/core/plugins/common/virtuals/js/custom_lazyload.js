define(["jquery"], function($, clientLib) {
	var self = {
		_lazySelector: '[data-lazy-srcset],[data-lazy-src],[data-lazy-bg-src]',
		_iolookup: { counter: 0, items: {} },
		_io: new IntersectionObserver(function(entries, observer) {
			entries.forEach(function(entry) {
				if (entry.isIntersecting) {
					var target = $(entry.target);
					var els = target.find(self._lazySelector);
					if (els.length) { self.rewrite(els, true); }

					self._iolookup.items[target.attr('data-lazy-index')](entry, observer);
					target.removeAttr('data-lazy-loading');
				}
			});

		}, { rootMargin: "100px", threshold: 0 }),
		_defaultCb: function(entry, observer) {
			self.unobserve(entry);
		},
		isLoading: function(root) {
			/* Tell us if our lazy load function is waiting */
			return root && root.attr('data-lazy-loading') !== undefined;
		},
		hasLazy: function(root) {
			/* This utility function can be used to test if have any items to lazy load */
			return root && root.find(self._lazySelector).length > 0;
		},
		getLazy: function(root) {
			return root ? root.find(self._lazySelector) : [];
		},
		rewrite: function(els, picturefillEval) {
			/* This utility function will rewrite any lazy load elements to remove data-lazy prefix
			   and do a picturefill re-evaluate if picturefill is being used.
			*/
			var doEval = picturefillEval === true;
			var reval = [];
			els.each(function() {
				var el = $(this);
				if (el.prop('tagName').toLowerCase() === 'img') { reval.push(this); }

				if (el.attr('data-lazy-srcset')) {
					el.attr('srcset', el.attr('data-lazy-srcset'));
					el.removeAttr('data-lazy-srcset');
				} else if (el.attr('data-lazy-src')) {
					el.attr('src', el.attr('data-lazy-src'));
					el.removeAttr('data-lazy-src');
				} else if (el.attr('data-lazy-bg-src')) {
					el.css('background-image', 'url('+ el.attr('data-lazy-bg-src') + ')');
					el.removeAttr('data-lazy-bg-src');
				}
			});
			if (window.picturefill && doEval && reval.length) {
				picturefill({
					reevaluate: true,
					elements: reval
				});
			}
		},
		unobserve: function(entry) {
			self._io.unobserve(entry.target);
			delete self._iolookup.items[$(entry.target).attr('data-lazy-index')];
			$(entry.target).attr('data-lazy-index', undefined);
		},
		lazy: function(els, cb) {
			/* we expect a jquery array of items */
			if (els === undefined) { return; }
			var cbFunc = cb || self._defaultCb;
			/* convert jquery array to simple array. otherwise assume it's an array of elements */
			var arr = els.get !== undefined ? els.get() : els;
			arr.forEach(function(el) {
				$(el).attr('data-lazy-index', self._iolookup.counter++);
				self._io.observe(el);
				self._iolookup.items[$(el).attr('data-lazy-index')] = cbFunc;
				$(el).attr('data-lazy-loading', true);
			});
		}
	};
	return self;
});