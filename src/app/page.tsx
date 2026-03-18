export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
          Stop Scrolling, Start Acting
        </h1>
        <p className="text-xl md:text-2xl text-slate-300 mb-8 max-w-2xl mx-auto">
          Expert-curated newsletters that cut through the noise. 
          Subscribe to intelligence, not information.
        </p>
        <div className="flex gap-4 justify-center">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition">
            Get Started
          </button>
          <button className="border border-slate-500 hover:border-slate-400 text-slate-300 px-8 py-3 rounded-lg font-semibold transition">
            Explore Newsletters
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Why MyJunto?</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-slate-800/50 p-6 rounded-xl">
            <h3 className="text-xl font-semibold mb-3 text-blue-400">Expert Curation</h3>
            <p className="text-slate-400">Top creators aggregate and synthesize the best content from across the web.</p>
          </div>
          <div className="bg-slate-800/50 p-6 rounded-xl">
            <h3 className="text-xl font-semibold mb-3 text-purple-400">AI-Powered</h3>
            <p className="text-slate-400">Intelligent aggregation from Twitter, YouTube, and more. Never miss what matters.</p>
          </div>
          <div className="bg-slate-800/50 p-6 rounded-xl">
            <h3 className="text-xl font-semibold mb-3 text-green-400">Creator Economy</h3>
            <p className="text-slate-400">Newsletter admins earn 70% of subscription revenue. Build your audience.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 text-center text-slate-500">
        <p>© 2026 MyJunto. All rights reserved.</p>
      </footer>
    </main>
  );
}
