import { MetadataRoute } from 'next';

const BASE_URL = 'https://adleakshield.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/blog/google-ads-clicks-but-no-calls`,
      lastModified: new Date('2026-06-16'),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];
}
