// Shared SEO entities and "best X" page data.
// This file has no imports on purpose: scripts/prerender-seo-pages.mjs loads it
// with Node's type stripping, so it must stay plain TypeScript (no enums, no
// path aliases, no runtime imports).

export const SITE_NAME = '360 Tours';
export const SITE_ORIGIN = 'https://tours.360ghar.com';
export const CHECKED_ON = '2026-11-08';
export const CHECKED_ON_TEXT = '8 November 2026';
export const PUBLISHER_LINE = 'Published by 360Ghar. We make 360 Tours, which is on this list.';

export const ORGANIZATION = {
  id: 'https://360ghar.com/#organization',
  name: '360Ghar',
  url: 'https://360ghar.com',
  // Same logo and profiles as the Organization node on 360ghar.com, so all three sites describe one entity.
  logo: 'https://360ghar.com/assets/images/logo/logo.png',
  sameAs: [
    'https://www.instagram.com/360ghar',
    'https://www.facebook.com/360ghar',
    'https://www.linkedin.com/company/360ghar',
    'https://twitter.com/360ghar',
    'https://www.youtube.com/@360ghar',
    'https://share.google/DgcLFqSyBgz7kBwKe',
  ],
} as const;

export const WEB_APPLICATION_ID = 'https://tours.360ghar.com/#app';

export interface BestPageProduct {
  name: string;
  /** Hosted web tool or desktop software, as the product describes itself. */
  kind: string;
  /** How tours are made, from the product's own site. */
  howTours: string;
  /** Pricing model as published on the product's own site. */
  pricing: string;
  /** Product page the facts were checked on. */
  sourceUrl: string;
  /** Store or product page that names an iOS or Android app. Set only for app rows. */
  appSourceUrl?: string;
  checkedOn: string;
}

export interface BestPageFaq {
  question: string;
  answer: string;
}

export interface BestPageContent {
  slug: string;
  /** Exact search term. Used as the <title> prefix and the <h1>. */
  term: string;
  description: string;
  /** Exactly two sentences. This is the text that search engines and LLMs quote. */
  answer: string;
  products: BestPageProduct[];
  /** Criteria that apply only to this page, listed after HOW_WE_PICKED. */
  extraCriteria?: string[];
  /** Which link the table shows per row: the product site, or the app page that supports the row. */
  sourceKind?: 'site' | 'app';
  faqs: BestPageFaq[];
}

export interface JsonLdBlock {
  type: 'ItemList' | 'BreadcrumbList' | 'FAQPage';
  data: Record<string, unknown>;
}

export const HOW_WE_PICKED: string[] = [
  'The product builds a tour from 360 images, 360 video or 3D capture. A product is included only when its own site says how tours are made.',
  "The product's own site describes its tour service. We give its pricing when the site publishes it, and we say so when it does not.",
  "Every fact comes from the product's own website, checked on 8 November 2026. We did not use reviews or third-party data.",
  'Hosted tools rank above desktop software. Within each group, names are in alphabetical order. 360 Tours follows the same rules as the other products.',
];

const PRODUCTS: BestPageProduct[] = [
  {
    name: '360 Tours',
    kind: 'Hosted web app',
    howTours:
      'Upload 360 images, or capture in the browser or with the mobile app. AI labels rooms and suggests hotspots.',
    pricing: 'Free. The pricing section lists all features at no cost for 360 Ghar users.',
    sourceUrl: 'https://tours.360ghar.com/#pricing',
    checkedOn: CHECKED_ON,
  },
  {
    name: 'CloudPano',
    kind: 'Hosted web platform',
    howTours:
      'Upload 360 photos, 360 video or 2D images. You can also capture with the CloudPano mobile app.',
    pricing: 'Free tier and paid plans. Prices are shown in $ with no currency code.',
    sourceUrl: 'https://www.cloudpano.com/',
    appSourceUrl: 'https://apps.apple.com/us/app/cloudpano-virtual-tour-creator/id1553738112',
    checkedOn: CHECKED_ON,
  },
  {
    name: 'Kuula',
    kind: 'Hosted web platform',
    howTours: 'Upload 360 images from a 360 camera, a DSLR or 3D software.',
    pricing: 'Free plan. Paid PRO and Business plans. Prices are not on the home page.',
    sourceUrl: 'https://kuula.co/',
    checkedOn: CHECKED_ON,
  },
  {
    name: 'Matterport',
    kind: 'Platform with 3D cameras',
    howTours:
      'Captured with a Matterport Pro2 or Pro3 3D camera. The Matterport app on iOS or Android controls the camera.',
    pricing: 'Not stated on the page checked.',
    sourceUrl: 'https://matterport.com/cameras',
    appSourceUrl: 'https://matterport.com/cameras',
    checkedOn: CHECKED_ON,
  },
  {
    name: 'Momento360',
    kind: 'Browser platform',
    howTours:
      'Upload 360 photos, drone panoramas or renderings. Share, embed and annotate them.',
    pricing: 'Free sign-up, no credit card needed. Paid plans; prices are not on the home page.',
    sourceUrl: 'http://www.momento360.com/',
    checkedOn: CHECKED_ON,
  },
  {
    name: 'Panoee',
    kind: 'Hosted web platform',
    howTours: 'Upload 360 panoramas. Add hotspots, floor plans and maps.',
    pricing: 'Free plan. Paid plans, monthly or yearly. Currency is not published.',
    sourceUrl: 'https://www.panoee.com/pricing',
    checkedOn: CHECKED_ON,
  },
  {
    name: 'RICOH360 Virtual Tour Creation Service',
    kind: 'Tour creation service',
    howTours:
      'Connects 360-degree images into immersive tours. The page does not state the upload steps.',
    pricing: 'Not stated on the page checked.',
    sourceUrl: 'https://www.ricoh360.com/',
    checkedOn: CHECKED_ON,
  },
  {
    name: 'TeliportMe',
    kind: 'Hosted web platform',
    howTours:
      'The page does not describe the steps. Plans list panorama size limits. iOS and Android apps are linked.',
    pricing:
      'No free plan listed. Free trial. Paid plans from $25 a month, or $19 a month billed yearly. Currency is not stated.',
    sourceUrl: 'https://www.teliportme.com/pricing',
    appSourceUrl: 'https://www.teliportme.com/pricing',
    checkedOn: CHECKED_ON,
  },
  {
    name: '3DVista Virtual Tour Pro',
    kind: 'Desktop software, optional hosting',
    howTours:
      'Stitches 360 photos into panoramas with a bundled tool. You link scenes with hotspots in a desktop editor.',
    pricing: 'One-time license at $499 USD. Optional hosting from 99 EUR a year.',
    sourceUrl: 'https://www.3dvista.com/en/products/virtual-tour-pro',
    checkedOn: CHECKED_ON,
  },
];

/** Rows whose own site names an iOS or Android app. 360 Tours has no store listing we could cite, so it is not here. */
const APP_PRODUCTS = PRODUCTS.filter((product) => product.appSourceUrl !== undefined);

export const BEST_PAGES: BestPageContent[] = [
  {
    slug: 'best-virtual-tour-software-india',
    term: 'Best virtual tour software India',
    description:
      'Compare virtual tour software for India: hosted tools and desktop software, how each makes tours, and published prices. Checked 8 November 2026.',
    answer:
      'For a browser tool that builds a 360 tour from your photos, 360 Tours and CloudPano both list a free tier. For a one-time purchase, 3DVista Virtual Tour Pro lists a license at $499 USD, and it runs on your own computer.',
    products: PRODUCTS,
    faqs: [
      {
        question: 'Is there free virtual tour software for India?',
        answer:
          '360 Tours lists its features at no cost for 360 Ghar users. CloudPano lists a free tier, and Momento360 needs no credit card to sign up. Check each site for limits.',
      },
      {
        question: 'Which virtual tour software has a one-time price?',
        answer:
          '3DVista Virtual Tour Pro is sold as a one-time license at $499 USD, as published on its product page. Its optional hosting is a separate yearly cost.',
      },
      {
        question: 'Do I need to install software?',
        answer:
          'No, for the hosted tools on this list. 3DVista Virtual Tour Pro is desktop software that you install on Windows or Mac.',
      },
      {
        question: 'Can I embed a tour on my website?',
        answer:
          'Yes, for 360 Tours, Momento360 and CloudPano. Each site says so. Check the other products on their own sites.',
      },
      {
        question: 'Which prices show a currency?',
        answer:
          '3DVista lists its prices in USD and EUR. CloudPano and TeliportMe show dollar signs without a currency code. Panoee does not publish a currency.',
      },
    ],
  },
  {
    slug: 'best-360-virtual-tour-software',
    term: 'Best 360 virtual tour software',
    description:
      'Compare 360 virtual tour software by how it makes tours, camera support and published prices. Checked 8 November 2026.',
    answer:
      'The best 360 virtual tour software depends on how you capture images. Kuula, Momento360 and CloudPano take 360 images that you upload, and 3DVista Virtual Tour Pro stitches your photos on your own computer.',
    products: PRODUCTS,
    faqs: [
      {
        question: 'Which image formats can I upload?',
        answer:
          '360 Tours accepts JPG, PNG and WebP images. Each file can be up to 50 MB by default.',
      },
      {
        question: 'Which 360 cameras does Kuula support?',
        answer:
          "Kuula's home page names Ricoh Theta, Labpano and Insta360 cameras. It also accepts DSLR shots and rendered images.",
      },
      {
        question: 'Do I need a special 360 camera?',
        answer:
          'CloudPano lists any 360 camera, a video or its mobile app as capture options. Momento360 says it works with any 360 camera. Matterport uses its own Pro2 or Pro3 3D cameras.',
      },
      {
        question: 'Does 360 Tours capture the photos for me?',
        answer:
          'Yes. You can capture in the browser or with the 360 Tours mobile app. You can also upload images that you already have.',
      },
      {
        question: 'Can 360 Tours create a tour automatically?',
        answer:
          'Yes. Its AI tool detects rooms, places hotspots and writes descriptions from your uploaded images.',
      },
    ],
  },
  {
    slug: 'best-real-estate-virtual-tour-software',
    term: 'Best real estate virtual tour software',
    description:
      'Compare virtual tour software for property listings: room links, floor plans, AI room labels and published prices. Checked 8 November 2026.',
    answer:
      'Property listings need room-to-room links and floor plans. 360 Tours adds AI room labels and a floor plan editor, and Panoee, 3DVista Virtual Tour Pro and CloudPano also list floor plans.',
    products: PRODUCTS,
    faqs: [
      {
        question: 'Which tools add floor plans?',
        answer:
          'Panoee, 3DVista Virtual Tour Pro and CloudPano list floor plans. TeliportMe lists floor plans as an add-on. 360 Tours has a floor plan editor.',
      },
      {
        question: 'Does 360 Tours label rooms?',
        answer:
          'Yes. Its AI scene analysis gives each scene a room type and a confidence score.',
      },
      {
        question: 'Can buyers view a tour without an account?',
        answer:
          'Yes, for 360 Tours. A published tour opens from a public link, and viewers do not need to sign in.',
      },
      {
        question: 'Can I share a tour with a QR code?',
        answer:
          'Yes. The 360 Tours share dialog includes a QR code and an embed code.',
      },
      {
        question: 'Which tools publish to Google Street View?',
        answer:
          '3DVista Virtual Tour Pro lists Google Street View publishing. Panoee lists it on its Pro plan.',
      },
    ],
  },
  {
    slug: 'best-virtual-tour-apps',
    term: 'Best virtual tour apps',
    description:
      'Compare virtual tour apps for iPhone and Android: which products list an app, what each app does and published prices. Checked 8 November 2026.',
    answer:
      'CloudPano, Matterport and TeliportMe each list an iOS or Android app on their own sites. The table shows how each product makes tours, and the pricing that each site states.',
    products: APP_PRODUCTS,
    sourceKind: 'app',
    extraCriteria: [
      "The product's own site names an iOS or Android app. Each row links to the page that names it.",
    ],
    faqs: [
      {
        question: 'Which virtual tour apps run on iPhone?',
        answer:
          'CloudPano Virtual Tour Creator runs on iPhone and iPad, and the App Store lists it as free. It uses the iPhone camera to capture auto-stitched 360 photos.',
      },
      {
        question: 'Which apps run on Android?',
        answer:
          "TeliportMe links an Android app from its pricing page. Matterport's app runs on iOS and Android and controls its 3D cameras.",
      },
      {
        question: 'Does the Matterport app replace a 3D camera?',
        answer:
          'No. The Matterport cameras page describes the app as a remote for its Pro2 and Pro3 3D cameras. It does not state that a phone alone can capture a space.',
      },
      {
        question: 'Can I capture a 360 tour with a phone?',
        answer:
          'CloudPano says you can capture with its mobile app, or with any 360 camera or video. The Matterport page does not state phone-only capture.',
      },
      {
        question: 'What does each product charge?',
        answer:
          'CloudPano lists paid plans in $, with no currency code. TeliportMe lists paid plans from $25 a month, or $19 a month billed yearly. Matterport does not state prices on the page checked.',
      },
    ],
  },
];

export function getBestPage(slug: string): BestPageContent | undefined {
  return BEST_PAGES.find((page) => page.slug === slug);
}

export function pageUrl(page: BestPageContent): string {
  return `${SITE_ORIGIN}/${page.slug}`;
}

/**
 * JSON-LD blocks for one best-X page. The React page and the static HTML
 * generator both use this function, so the FAQ text in the markup is the same
 * text the reader sees.
 */
export function bestPageJsonLd(page: BestPageContent): JsonLdBlock[] {
  const url = pageUrl(page);
  return [
    {
      type: 'ItemList',
      data: {
        '@id': `${url}#list`,
        name: page.term,
        url,
        numberOfItems: page.products.length,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        itemListElement: page.products.map((product, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: product.name,
          url: product.sourceUrl,
        })),
        publisher: { '@id': ORGANIZATION.id },
      },
    },
    {
      type: 'BreadcrumbList',
      data: {
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: page.term, item: url },
        ],
      },
    },
    {
      type: 'FAQPage',
      data: {
        '@id': `${url}#faq`,
        mainEntity: page.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
        publisher: { '@id': ORGANIZATION.id },
      },
    },
  ];
}
