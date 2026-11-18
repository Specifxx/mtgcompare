export default function NotFound() {
  return (
    <div className="page">
      <h1>Page not found</h1>
      <p className="lede">
        That card or set is not here. Try the search above, or go <a href="/" style={{ color: "var(--brand)" }}>home</a>.
      </p>
    </div>
  );
}
