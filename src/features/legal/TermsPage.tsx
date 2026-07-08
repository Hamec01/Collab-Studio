export function TermsPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto text-slate-200">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <p className="mb-4 text-slate-400">Last updated: July 2026</p>
      
      <div className="space-y-6 text-slate-300">
        <section>
          <h2 className="text-xl font-semibold mb-3 text-white">1. Acceptance of Terms</h2>
          <p>By accessing or using CollabStudio, you agree to be bound by these Terms of Service. If you do not agree to all the terms and conditions, you must not use the platform.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-white">2. User Content</h2>
          <p>You retain all ownership rights to the content you upload to CollabStudio. By uploading content, you grant CollabStudio a non-exclusive, worldwide, royalty-free license to use, reproduce, and display the content solely for the purpose of operating the platform.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-white">3. Prohibited Conduct</h2>
          <p>You agree not to engage in any of the following activities:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Uploading copyright-infringing material.</li>
            <li>Harassing, abusing, or harming other users.</li>
            <li>Spamming or spreading malicious software.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 text-white">4. Account Termination</h2>
          <p>We reserve the right to suspend or terminate your account at our sole discretion, without notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties.</p>
        </section>
      </div>
    </div>
  );
}
