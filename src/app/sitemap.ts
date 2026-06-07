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
    // TODO: Add blog index and individual blog posts here when the blog is built
    // {
    //   url: `${BASE_URL}/blog`,
    //   lastModified: new Date(),
    //   changeFrequency: 'weekly',
    //   priority: 0.8,
    // },
  ];
}
