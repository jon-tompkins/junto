export default function Features() {
  const features = [
    { title: "Expert Curation", desc: "Top creators aggregate the best content", color: "blue" },
    { title: "AI-Powered", desc: "Intelligent aggregation from multiple sources", color: "purple" },
    { title: "Creator Economy", desc: "Earn 70% of subscription revenue", color: "green" },
  ];

  return (
    <section className="py-16">
      <h2 className="text-3xl font-bold text-center mb-12">Features</h2>
      <div className="grid md:grid-cols-3 gap-8">
        {features.map((f) => (
          <div key={f.title} className="bg-slate-800/50 p-6 rounded-xl">
            <h3 className={`text-xl font-semibold mb-3 text-${f.color}-400`}>{f.title}</h3>
            <p className="text-slate-400">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
