import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Standard search engine crawlers — homepage only
        userAgent: '*',
        allow: [
          '/',
          '/blog',
          '/blog/',
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
      { userAgent: 'GPTBot',             allow: ['/', '/blog', '/blog/'] },
      { userAgent: 'ClaudeBot',          allow: ['/', '/blog', '/blog/'] },
      { userAgent: 'anthropic-ai',       allow: ['/', '/blog', '/blog/'] },
      { userAgent: 'PerplexityBot',      allow: ['/', '/blog', '/blog/'] },
      { userAgent: 'Googlebot',          allow: ['/', '/blog', '/blog/'] },
      { userAgent: 'Google-Extended',    allow: ['/', '/blog', '/blog/'] },
      { userAgent: 'cohere-ai',          allow: ['/', '/blog', '/blog/'] },
      { userAgent: 'Meta-ExternalAgent', allow: ['/', '/blog', '/blog/'] },
      { userAgent: 'Bytespider',         disallow: ['/'] },  // ByteDance / TikTok — block
    ],
    sitemap: 'https://adleakshield.com/sitemap.xml',
    host: 'https://adleakshield.com',
  };
}
