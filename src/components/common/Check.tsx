export default function Check({
  done,
  title,
  note,
}: {
  done: boolean;
  title: string;
  note: string;
}) {
  return (
    <div className="check">
      <i className={done ? "done" : ""}>{done ? "✓" : "·"}</i>
      <div>
        <b>{title}</b>
        <small>{note}</small>
      </div>
    </div>
  );
}
