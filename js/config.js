// Public configuration for the standalone website (GitHub Pages).
// The publishable key is meant to be public: row-level security in the database decides what each person can read and write.
export const SUPABASE = {
  url: 'https://uumnakjtqelkbjnxaxfj.supabase.co',
  key: 'sb_publishable_6TyYSplQEU5dkqe0hWH4Tg_MaLIXzhR',
  // Turn a provider on here after enabling it in Supabase → Authentication → Sign In / Providers.
  providers: { google: true, azure: true, apple: false },
  email: true,
  // The website's AI server (api/ai.js, deployed with the site on Vercel). Empty turns the AI features off on the website.
  ai: '/api/ai',
};
