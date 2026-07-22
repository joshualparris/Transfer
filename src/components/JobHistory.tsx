export default function JobHistory({ jobs }: { jobs: any[] }) {
  return (
    <section className="panel">
      <h3>Job history</h3>
      {jobs.length ? (
        jobs.map((job) => (
          <div className="job" key={job.id}>
            <b>{String(job.type ?? "gmail_migration").replaceAll("_", " ")}</b>
            <span>{job.status}</span>
            <small>{job.started_at}</small>
          </div>
        ))
      ) : (
        <p>No jobs yet.</p>
      )}
    </section>
  );
}
