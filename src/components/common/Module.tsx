export default function Module({
  title,
  main,
  lines,
}: {
  title: string;
  main: string;
  lines: string[];
}) {
  return (
    <section className="panel module">
      <p className="eyebrow">{title}</p>
      <h3>{main}</h3>
      {lines.map((line) => (
        <small key={line}>{line}</small>
      ))}
    </section>
  );
}
