export function PrivacyPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto text-slate-200">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="mb-4 text-slate-400">Last updated: July 2026</p>
      
      <div className="space-y-6 text-slate-300">
        <section>
          <h2 className="text-xl font-semibold mb-3 text-white">1. Information We Collect</h2>
          <p>We collect information you provide directly to us when you register, update your profile, or upload content. This includes your email address, username, profile picture, and any audio files or metadata you upload.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-white">2. How We Use Information</h2>
          <p>We use the information we collect to operate, maintain, and improve our services. We do not sell your personal data to third parties.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-white">3. Data Retention</h2>
          <p>We store your data for as long as your account is active. If you delete your account, we will remove your personal data from our active databases, though some data may remain in backups for a limited period.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-white">4. Cookies</h2>
          <p>We use cookies strictly for authentication and session management. We do not use third-party tracking cookies for advertising purposes.</p>
        </section>
      </div>
    </div>
  );
}
