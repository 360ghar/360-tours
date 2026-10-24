/**
 * Request limits read from openapi/openapi.json by scripts/api-limits.mjs.
 * Do not edit by hand: run `npm run api:types`.
 */
export const API_LIMITS = {
  "tour": {
    "titleMax": 255,
    "descriptionMax": 5000
  },
  "scene": {
    "titleMax": 255,
    "descriptionMax": 2000,
    "imageUrlMax": 500
  },
  "hotspot": {
    "titleMax": 255,
    "descriptionMax": 2000,
    "iconMax": 50,
    "iconNameMax": 100,
    "iconSizeMin": 16,
    "iconSizeMax": 100,
    "linkUrlMax": 2048,
    "linkLabelMax": 255,
    "infoTextMax": 10000,
    "infoHtmlMax": 20000,
    "customHtmlMax": 20000,
    "mediaUrlMax": 2048
  },
  "floorPlan": {
    "nameMax": 255,
    "imageUrlMax": 512,
    "floorNumberMin": 1,
    "markerLabelMax": 255
  },
  "descriptionOptions": {
    "targetAudienceMax": 255
  },
  "customDomain": {
    "domainMin": 3,
    "domainMax": 255
  },
  "capture": {
    "titleMax": 255
  },
  "branding": {
    "logoUrlMax": 500,
    "colorMax": 32,
    "fontFamilyMax": 100,
    "customCssMax": 10000
  },
  "media": {
    "batchDeleteMax": 50
  }
} as const;
