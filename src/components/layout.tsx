import type { Child } from 'hono/jsx';

export const Layout = ({ title, children }: { title: string; children: Child }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="description" content="Private resume marketplace for US and Canadian jobs." />
      <title>{title}</title>
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body>
      <header class="site-header">
        <a class="brand" href="/">OpenResume Jobs</a>
        <nav aria-label="Main navigation">
          <a href="/jobs">Jobs</a>
          <a href="/pricing">Pricing</a>
          <a href="/for-employers">For employers</a>
          <a href="/login">Sign in</a>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/identity-verification">Identity verification</a>
      </footer>
    </body>
  </html>
);
