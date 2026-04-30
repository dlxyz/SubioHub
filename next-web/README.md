This is the `next-web` application for SubioHub. It provides the public site, user dashboard, and admin console on top of the Go backend APIs.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
Set `NEXT_SERVER_API_ORIGIN`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_SITE_URL` in `.env.local` when connecting to a local backend.

Production build:

```bash
npm run build
```

## Notes

- Main project documentation lives in the repository root `README*.md`.
- This app uses standard Next.js scripts from `package.json`.
