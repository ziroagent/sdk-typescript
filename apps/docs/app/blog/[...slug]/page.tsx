import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { baseOptions } from '@/app/layout.config';
import { blogSource } from '@/lib/source';

interface BlogFrontmatter {
  title: string;
  description?: string;
  date?: string | Date;
  authors?: string[];
  tags?: string[];
}

export default async function BlogPostPage(props: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await props.params;
  const page = blogSource.getPage(slug);
  if (!page) notFound();

  const data = page.data as BlogFrontmatter & {
    body: React.ComponentType;
  };
  const MDX = data.body;

  return (
    <HomeLayout {...baseOptions}>
      <main className="container mx-auto max-w-3xl px-4 py-16">
        <Link
          href="/blog"
          className="text-xs uppercase tracking-wider text-fd-muted-foreground hover:text-fd-foreground"
        >
          ← Blog
        </Link>
        <header className="mt-6">
          {data.date ? (
            <time className="text-xs uppercase tracking-wider text-fd-muted-foreground">
              {new Date(data.date).toISOString().slice(0, 10)}
            </time>
          ) : null}
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{data.title}</h1>
          {data.description ? (
            <p className="mt-3 text-base text-fd-muted-foreground">{data.description}</p>
          ) : null}
        </header>
        <article className="prose prose-zinc mt-10 max-w-none dark:prose-invert">
          <MDX />
        </article>
      </main>
    </HomeLayout>
  );
}

export function generateStaticParams() {
  return blogSource.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const page = blogSource.getPage(slug);
  if (!page) return {};
  const data = page.data as BlogFrontmatter;
  const url = `https://ziroagent.com${page.url}`;
  return {
    title: data.title,
    description: data.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: data.title,
      description: data.description,
      url,
      siteName: 'ZiroAgent SDK',
      ...(data.date ? { publishedTime: new Date(data.date).toISOString() } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: data.title,
      description: data.description,
    },
  };
}
