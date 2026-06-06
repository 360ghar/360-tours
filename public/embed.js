/**
 * 360 Viewer Embed SDK
 * Provides the Viewer360.create() API referenced by the JS embed code generator.
 *
 * Usage:
 *   <div id="viewer-abc123"></div>
 *   <script src="https://your-domain.com/embed.js"></script>
 *   <script>
 *     Viewer360.create('#viewer-abc123', { tourId: 'abc123', width: '100%', height: 500 });
 *   </script>
 */
(function () {
  'use strict';

  function getBaseUrl() {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || '';
      if (src.indexOf('embed.js') !== -1) {
        return src.replace(/\/embed\.js.*$/, '');
      }
    }
    return '';
  }

  var BASE_URL = getBaseUrl();

  var ALLOWED_ORIGINS = [BASE_URL];

  function isAllowedOrigin(origin) {
    if (!origin) return false;
    for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
      if (ALLOWED_ORIGINS[i] && origin === ALLOWED_ORIGINS[i]) return true;
    }
    return false;
  }

  function buildEmbedUrl(tourId, options) {
    var url = BASE_URL + '/embed/' + encodeURIComponent(tourId);
    var params = [];

    if (options.startScene) params.push('scene=' + encodeURIComponent(options.startScene));
    if (options.autoplay !== undefined) params.push('autoplay=' + (options.autoplay ? 'true' : 'false'));
    if (options.navbar !== undefined) params.push('navbar=' + (options.navbar ? 'true' : 'false'));
    if (options.minimal !== undefined) params.push('minimal=' + (options.minimal ? 'true' : 'false'));
    if (options.autohide !== undefined) params.push('autohide=' + (options.autohide ? 'true' : 'false'));
    if (options.fullscreen !== undefined) params.push('fullscreen=' + (options.fullscreen ? 'true' : 'false'));
    if (options.vr !== undefined) params.push('vr=' + (options.vr ? 'true' : 'false'));
    if (options.autoRotate !== undefined) params.push('rotate=' + (options.autoRotate ? 'true' : 'false'));
    if (options.branding !== undefined) params.push('branding=' + (options.branding ? 'true' : 'false'));

    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      params.push('origin=' + encodeURIComponent(window.location.origin));
      if (ALLOWED_ORIGINS.indexOf(window.location.origin) === -1) {
        ALLOWED_ORIGINS.push(window.location.origin);
      }
    }

    if (params.length > 0) url += '?' + params.join('&');
    return url;
  }

  function toCss(value) {
    if (typeof value === 'number') return value + 'px';
    return String(value);
  }

  function create(selector, options) {
    if (!options || !options.tourId) {
      throw new Error('Viewer360: tourId is required');
    }

    var container =
      typeof selector === 'string' ? document.querySelector(selector) : selector;

    if (!container) {
      throw new Error('Viewer360: container not found — ' + selector);
    }

    var width = toCss(options.width || '100%');
    var height = toCss(options.height || 500);

    var iframe = document.createElement('iframe');
    iframe.src = buildEmbedUrl(options.tourId, options);
    iframe.style.width = width;
    iframe.style.height = height;
    iframe.style.border = 'none';
    iframe.style.borderRadius = '8px';
    iframe.setAttribute('allow', 'fullscreen; xr-spatial-tracking; accelerometer; gyroscope');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');

    container.appendChild(iframe);

    var listeners = {};

    function onMessage(event) {
      if (!iframe.contentWindow || event.source !== iframe.contentWindow) return;
      if (!isAllowedOrigin(event.origin)) return;
      var data = event.data;
      if (data && data.type && listeners[data.type]) {
        listeners[data.type].forEach(function (fn) {
          fn(data);
        });
      }
    }

    window.addEventListener('message', onMessage);

    return {
      iframe: iframe,

      on: function (eventType, callback) {
        if (!listeners[eventType]) listeners[eventType] = [];
        listeners[eventType].push(callback);
        return this;
      },

      addAllowedOrigin: function (origin) {
        if (origin && ALLOWED_ORIGINS.indexOf(origin) === -1) {
          ALLOWED_ORIGINS.push(origin);
        }
        return this;
      },

      destroy: function () {
        window.removeEventListener('message', onMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        listeners = {};
      },
    };
  }

  window.Viewer360 = { create: create };
})();
