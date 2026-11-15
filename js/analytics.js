/* Shared analytics bootstrap: Google Tag Manager + a small event helper. */
(function (window, document) {
  'use strict';

  window.dataLayer = window.dataLayer || [];
  window.trackEvent = function (event, params) {
    var payload = { event: event };
    if (params) {
      for (var key in params) {
        if (Object.prototype.hasOwnProperty.call(params, key)) payload[key] = params[key];
      }
    }
    window.dataLayer.push(payload);
  };

  // Track navigation into an In Motion city from any page.
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a') : null;
    if (!link) return;
    var match = /\/visualizations\/([^/]+)-in-motion\/?/.exec(link.getAttribute('href') || '');
    if (match) {
      window.trackEvent('motion_city_open', {
        city: match[1],
        link_url: link.href,
      });
    }
  });

  // Local previews and automated test runs must not pollute production data.
  var host = window.location.hostname;
  var local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (local || new URLSearchParams(window.location.search).has('test')) return;

  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  var first = document.getElementsByTagName('script')[0];
  var gtm = document.createElement('script');
  gtm.async = true;
  gtm.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-WZ2695VC';
  first.parentNode.insertBefore(gtm, first);
})(window, document);
