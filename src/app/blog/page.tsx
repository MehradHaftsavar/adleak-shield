import Link from 'next/link';
import { MarketingShell } from '@/components/layout/MarketingShell';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog — Google Ads Tips & Insights | AdLeak Shield',
  description: 'Practical guides and insights for small businesses running Google Ads. Learn how to stop wasting budget, improve conversions, and get more calls from your campaigns.',
  alternates: {
    canonical: 'https://www.adleakshield.com/blog',
  },
  openGraph: {
    url: 'https://www.adleakshield.com/blog',
  },
};

const posts = [
  {
    slug: 'google-ads-clicks-but-no-calls',
    title: 'Why Your Google Ads Are Getting Clicks But No Calls',
    excerpt: "Spending money on Google Ads but the phone isn't ringing? Here are the six most common reasons your campaign is leaking budget — and how to plug each one.",
    date: '16 June 2026',
    readTime: '6 min read',
    category: 'Google Ads',
  },
];

export default function BlogPage() {
  return (
    <MarketingShell>
      <div className="bg-gray-50 min-h-screen">
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-6 py-16">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Blog</h1>
            <p className="text-lg text-gray-600 max-w-2xl">
              Practical guides and insights for small businesses running Google Ads. Less theory, more fixing the actual problems costing you money.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="grid gap-8">
            {posts.map(post => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block bg-white rounded-xl border border-gray-200 p-8 hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                    {post.category}
                  </span>
                  <span className="text-xs text-gray-400">{post.date}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-400">{post.readTime}</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">
                  {post.title}
                </h2>
                <p className="text-gray-600 leading-relaxed mb-4">{post.excerpt}</p>
                <span className="text-sm font-semibold text-blue-600 group-hover:underline">
                  Read article →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
