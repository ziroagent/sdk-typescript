import { HomeLayout } from 'fumadocs-ui/layouts/home';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { baseOptions } from '@/app/layout.config';
import { blogSource } from '@/lib/source';

export const metadata = {
  title: 'Blog · ZiroAgent SDK',
  description: 'Release notes, RFCs, and roadmap updates for the ZiroAgent SDK.',
};

interface BlogFrontmatter {
  title: string;
  description?: string;
  date?: string | Date;
  authors?: string[];
  tags?: string[];
}

interface BlogPage {
  url: string;
  data: BlogFrontmatter;
}

export default function BlogIndex(): ReactNode {
  const posts = (blogSource.getPages() as unknown as BlogPage[]).slice().sort((a, b) => {
    const da = a.data.date;
    const db = b.data.date;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return new Date(db).getTime() - new Date(da).getTime();
  });

  return (
    <HomeLayout {...baseOptions}>
      <main className="container mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Blog</h1>
        <p className="mt-2 text-fd-muted-foreground">
          Release notes, RFCs, and roadmap updates for the ZiroAgent SDK.
        </p>
        <ul className="mt-10 flex flex-col divide-y divide-fd-border">
          {posts.map((post) => (
            <li key={post.url} className="py-6">
              <Link href={post.url} className="block transition hover:opacity-80">
                {post.data.date ? (
                  <time className="text-xs uppercase tracking-wider text-fd-muted-foreground">
                    {new Date(post.data.date).toISOString().slice(0, 10)}
                  </time>
                ) : null}
                <h2 className="mt-1 text-xl font-medium">{post.data.title}</h2>
                {post.data.description ? (
                  <p className="mt-2 text-sm text-fd-muted-foreground">{post.data.description}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </HomeLayout>
  );
}
