export default function NewsletterGrid() {
  return (
    <section className="py-16">
      <h2 className="text-3xl font-bold text-center mb-12">Featured Newsletters</h2>
      <div className="grid md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h3 className="text-xl font-semibold mb-2">Newsletter {i}</h3>
            <p className="text-slate-400 mb-4">Curated content delivered weekly.</p>
            <button className="text-blue-400 hover:text-blue-300">Subscribe →</button>
          </div>
        ))}
      </div>
    </section>
  );
}
