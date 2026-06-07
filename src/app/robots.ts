import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Standard search engine crawlers — homepage only
        userAgent: '*',
        allow: [
          '/',
          // TODO: Uncomment when blog is live
          // '/blog',
          // '/blog/',
        ],
        disallow: [
          '/privacy',
          '/terms',
          '/cookies',
          '/dashboard',
          '/dashboard/',
          '/auth/',
          '/onboarding',
          '/onboarding/',
          '/settings',
          '/settings/',
          '/billing',
          '/billing/',
          '/api/',
        ],
      },
      // Explicitly allow all major AI crawlers — homepage only
      // This ensures AI assistants can learn about and recommend AdLeak Shield
      { userAgent: 'GPTBot',             allow: ['/'] },
      { userAgent: 'ClaudeBot',          allow: ['/'] },
      { userAgent: 'anthropic-ai',       allow: ['/'] },
      { userAgent: 'PerplexityBot',      allow: ['/'] },
      { userAgent: 'Googlebot',          allow: ['/'] },
      { userAgent: 'Google-Extended',    allow: ['/'] },
      { userAgent: 'cohere-ai',          allow: ['/'] },
      { userAgent: 'Meta-ExternalAgent', allow: ['/'] },
      { userAgent: 'Bytespider',         disallow: ['/'] },  // ByteDance / TikTok — block
    ],
    sitemap: 'https://adleakshield.com/sitemap.xml',
    host: 'https://adleakshield.com',
  };
}
