// Writes src/lib/api/limits.gen.ts from openapi/openapi.json so form limits come from
// the backend schema and cannot drift. Run through `npm run api:types`.
import { readFileSync, writeFileSync } from 'node:fs';

const spec = JSON.parse(readFileSync('openapi/openapi.json', 'utf8'));
const schemas = spec.components.schemas;

// group -> key -> [schema, property, keyword]
const WANTED = {
  tour: {
    titleMax: ['TourCreate', 'title', 'maxLength'],
    descriptionMax: ['TourCreate', 'description', 'maxLength'],
  },
  scene: {
    titleMax: ['SceneCreate', 'title', 'maxLength'],
    descriptionMax: ['SceneCreate', 'description', 'maxLength'],
    imageUrlMax: ['SceneCreate', 'image_url', 'maxLength'],
  },
  hotspot: {
    titleMax: ['HotspotCreate', 'title', 'maxLength'],
    descriptionMax: ['HotspotCreate', 'description', 'maxLength'],
    iconMax: ['HotspotCreate', 'icon', 'maxLength'],
    iconNameMax: ['HotspotCreate', 'icon_name', 'maxLength'],
    iconSizeMin: ['HotspotCreate', 'icon_size', 'minimum'],
    iconSizeMax: ['HotspotCreate', 'icon_size', 'maximum'],
    linkUrlMax: ['LinkContent', 'url', 'maxLength'],
    linkLabelMax: ['LinkContent', 'label', 'maxLength'],
    infoTextMax: ['InfoContent', 'text', 'maxLength'],
    infoHtmlMax: ['InfoContent', 'html', 'maxLength'],
    customHtmlMax: ['CustomContent', 'html', 'maxLength'],
    mediaUrlMax: ['AudioContent', 'audio_url', 'maxLength'],
  },
  floorPlan: {
    nameMax: ['FloorPlanCreate', 'name', 'maxLength'],
    imageUrlMax: ['FloorPlanCreate', 'image_url', 'maxLength'],
    floorNumberMin: ['FloorPlanCreate', 'floor_number', 'minimum'],
    markerLabelMax: ['FloorPlanMarkerIn', 'label', 'maxLength'],
  },
  descriptionOptions: {
    targetAudienceMax: ['DescriptionOptions', 'target_audience', 'maxLength'],
  },
  customDomain: {
    domainMin: ['CustomDomainCreate', 'domain', 'minLength'],
    domainMax: ['CustomDomainCreate', 'domain', 'maxLength'],
  },
  capture: {
    titleMax: ['CaptureSessionCreate', 'title', 'maxLength'],
  },
  branding: {
    logoUrlMax: ['TourBrandingSettings', 'logo_url', 'maxLength'],
    colorMax: ['TourBrandingSettings', 'primary_color', 'maxLength'],
    fontFamilyMax: ['TourBrandingSettings', 'font_family', 'maxLength'],
    customCssMax: ['TourBrandingSettings', 'custom_css', 'maxLength'],
  },
  media: {
    batchDeleteMax: ['BatchDeleteRequest', 'media_ids', 'maxItems'],
  },
};

function read([schema, prop, keyword]) {
  const node = schemas[schema]?.properties?.[prop];
  if (!node) throw new Error(`api-limits: ${schema}.${prop} is not in the schema`);
  for (const candidate of [node, ...(node.anyOf ?? [])]) {
    if (typeof candidate[keyword] === 'number') return candidate[keyword];
  }
  throw new Error(`api-limits: ${schema}.${prop} has no ${keyword}`);
}

const out = {};
for (const [group, keys] of Object.entries(WANTED)) {
  out[group] = Object.fromEntries(Object.entries(keys).map(([key, ref]) => [key, read(ref)]));
}

const body = `/**
 * Request limits read from openapi/openapi.json by scripts/api-limits.mjs.
 * Do not edit by hand: run \`npm run api:types\`.
 */
export const API_LIMITS = ${JSON.stringify(out, null, 2)} as const;
`;
writeFileSync('src/lib/api/limits.gen.ts', body);
console.log('wrote src/lib/api/limits.gen.ts');
