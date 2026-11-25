// Public configuration for the standalone website (Vercel).
// The publishable key is meant to be public: row-level security in the database decides what each person can read and write.
export const SUPABASE = {
  url: 'https://uumnakjtqelkbjnxaxfj.supabase.co',
  key: 'sb_publishable_6TyYSplQEU5dkqe0hWH4Tg_MaLIXzhR',
  // Sign-in methods the site may offer. The sign-in window also asks Supabase which ones are switched on
  // (Authentication → Sign In / Providers) and shows only those, so a method appears once it's enabled there.
  providers: { google: true, azure: true, apple: true },
  email: true,
  // The website's AI server (api/ai.js, deployed with the site on Vercel). Empty turns the AI features off on the website.
  ai: '/api/ai',
};
