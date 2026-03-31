const pillars = [
  {
    title: "Inventory",
    body: "Track medicines by batch, expiry, and quantity so stock never disappears silently."
  },
  {
    title: "Sales",
    body: "Record counter transactions quickly and reduce stock automatically after every sale."
  },
  {
    title: "Loss Control",
    body: "Require reasons for adjustments and make suspicious stock changes visible to owners."
  },
  {
    title: "Reports",
    body: "Give pharmacy owners a simple daily view of sales, low stock, expiry risk, and adjustments."
  }
];

const roadmap = [
  "Authentication and role-based access",
  "Medicine, batch, and stock movement engine",
  "Sales and inventory adjustments",
  "Audit logs, alerts, and dashboard summaries"
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div className="eyebrow">PharmaHub Foundation</div>
        <h1>Open-source pharmacy operations software built for real pharmacy workflows.</h1>
        <p className="hero-copy">
          This starter lays down the product scope, initial schema, Docker deployment path, and
          monorepo structure for the PharmaHub MVP.
        </p>
        <div className="hero-actions">
          <a className="primary-link" href="http://localhost:4000/health">
            API Health
          </a>
          <a className="secondary-link" href="https://github.com">
            Publish Open Source
          </a>
        </div>
      </section>

      <section className="grid-section">
        {pillars.map((pillar) => (
          <article className="card" key={pillar.title}>
            <h2>{pillar.title}</h2>
            <p>{pillar.body}</p>
          </article>
        ))}
      </section>

      <section className="roadmap">
        <div className="roadmap-header">
          <h2>Suggested Build Sequence</h2>
          <p>Start with the stock ledger and permissions, then layer the UI on top of working flows.</p>
        </div>
        <ol>
          {roadmap.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
