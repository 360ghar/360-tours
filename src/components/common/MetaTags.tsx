import { useEffect, useRef } from 'react';
import { APP_NAME } from '@/constants';

interface MetaTagsProps {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'product';
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  twitterCard?: 'summary' | 'summary_large_image' | 'player';
  noindex?: boolean;
  children?: React.ReactNode;
}

interface StructuredDataProps {
  type: 'WebApplication' | 'Organization' | 'Product' | 'VirtualTour' | 'ImageGallery';
  data: Record<string, unknown>;
}

export function MetaTags({
  title,
  description,
  keywords = [],
  image,
  url,
  type = 'website',
  publishedTime,
  modifiedTime,
  author,
  twitterCard = 'summary_large_image',
  noindex = false,
}: MetaTagsProps) {
  const fullTitle = title ? `${title} | ${APP_NAME}` : APP_NAME;
  const defaultDescription = 'Create immersive 360° virtual tours with our easy-to-use platform. Perfect for real estate, hospitality, and more.';
  const metaDescription = description || defaultDescription;
  const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

  const managedElementsRef = useRef<Element[]>([]);

  useEffect(() => {
    const managed: Element[] = [];

    const setMetaTag = (name: string, content: string, property = false) => {
      const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let element = document.querySelector(selector);

      if (!element) {
        element = document.createElement('meta');
        if (property) {
          element.setAttribute('property', name);
        } else {
          element.setAttribute('name', name);
        }
        document.head.appendChild(element);
        managed.push(element);
      }

      element.setAttribute('content', content);
    };

    document.title = fullTitle;

    setMetaTag('description', metaDescription);
    if (keywords.length > 0) {
      setMetaTag('keywords', keywords.join(', '));
    }
    if (author) {
      setMetaTag('author', author);
    }
    if (noindex) {
      setMetaTag('robots', 'noindex, nofollow');
    } else {
      setMetaTag('robots', 'index, follow');
    }

    setMetaTag('og:title', fullTitle, true);
    setMetaTag('og:description', metaDescription, true);
    setMetaTag('og:type', type, true);
    setMetaTag('og:url', currentUrl, true);
    if (image) {
      setMetaTag('og:image', image, true);
      setMetaTag('og:image:alt', fullTitle, true);
    }
    setMetaTag('og:site_name', APP_NAME, true);
    if (publishedTime) {
      setMetaTag('article:published_time', publishedTime, true);
    }
    if (modifiedTime) {
      setMetaTag('article:modified_time', modifiedTime, true);
    }

    setMetaTag('twitter:card', twitterCard);
    setMetaTag('twitter:title', fullTitle);
    setMetaTag('twitter:description', metaDescription);
    if (image) {
      setMetaTag('twitter:image', image);
    }

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
      managed.push(canonical);
    }
    canonical.setAttribute('href', currentUrl);

    managedElementsRef.current = managed;

    return () => {
      for (const el of managedElementsRef.current) {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }
      managedElementsRef.current = [];
      document.title = APP_NAME;
    };
  }, [
    fullTitle,
    metaDescription,
    keywords,
    image,
    currentUrl,
    type,
    publishedTime,
    modifiedTime,
    author,
    twitterCard,
    noindex,
  ]);

  return null;
}

export function StructuredData({ type, data }: StructuredDataProps) {
  useEffect(() => {
    const existingScript = document.getElementById(`structured-data-${type}`);
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement('script');
    script.id = `structured-data-${type}`;
    script.type = 'application/ld+json';

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': type,
      ...data,
    };

    script.textContent = JSON.stringify(structuredData);
    document.head.appendChild(script);

    return () => {
      const el = document.getElementById(`structured-data-${type}`);
      if (el) el.remove();
    };
  }, [type, data]);

  return null;
}

export function OrganizationStructuredData({
  name = APP_NAME,
  url,
  logo,
  sameAs = [],
}: {
  name?: string;
  url?: string;
  logo?: string;
  sameAs?: string[];
}) {
  return (
    <StructuredData
      type="Organization"
      data={{
        name,
        url: url || (typeof window !== 'undefined' ? window.location.origin : ''),
        logo,
        sameAs,
      }}
    />
  );
}

export function VirtualTourStructuredData({
  name,
  description,
  image,
  url,
  creator,
  datePublished,
  dateModified,
}: {
  name: string;
  description: string;
  image?: string;
  url?: string;
  creator?: string;
  datePublished?: string;
  dateModified?: string;
}) {
  return (
    <StructuredData
      type="ImageGallery"
      data={{
        name,
        description,
        image,
        url: url || (typeof window !== 'undefined' ? window.location.href : ''),
        creator: creator ? { '@type': 'Person', name: creator } : undefined,
        datePublished,
        dateModified,
        accessMode: ['visual'],
        accessibilityFeature: ['highContrastDisplay'],
        isAccessibleForFree: true,
      }}
    />
  );
}

export function WebApplicationStructuredData({
  applicationCategory = 'BusinessApplication',
  operatingSystem = 'Web Browser',
  offers,
}: {
  applicationCategory?: string;
  operatingSystem?: string;
  offers?: {
    price: string | number;
    priceCurrency: string;
  };
}) {
  return (
    <StructuredData
      type="WebApplication"
      data={{
        name: APP_NAME,
        applicationCategory,
        operatingSystem,
        offers: offers
          ? {
              '@type': 'Offer',
              price: offers.price,
              priceCurrency: offers.priceCurrency,
            }
          : undefined,
        featureList: [
          '360° virtual tours',
          'VR support',
          'Interactive hotspots',
          'Analytics dashboard',
          'Team collaboration',
          'White-label branding',
        ],
      }}
    />
  );
}
