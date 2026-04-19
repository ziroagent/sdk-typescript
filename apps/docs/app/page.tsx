import Link from 'next/link';

export default function HomePage() {
  return (
    <main
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 1.5rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '3rem', margin: 0 }}>Ziro AI SDK</h1>
      <p style={{ maxWidth: 600, color: 'var(--color-fd-muted-foreground, #6b7280)' }}>
        Open-source, full-stack TypeScript SDK for building AI agents and workflows.
      </p>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <Link
          href="/docs"
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            background: '#000',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          Read the docs
        </Link>
        <a
          href="https://github.com/ziro-ai/sdk"
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid currentColor',
            textDecoration: 'none',
          }}
        >
          GitHub
        </a>
      </div>
    </main>
  );
}
