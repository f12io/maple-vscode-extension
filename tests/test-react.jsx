export function MyComponent() {
  return (
    <div className="bgc-blue-500 c-white p-4">
      <span className={`fw-bold ${true ? "m-4" : "m-6"}`}>
        React Example
      </span>
    </div>
  );
}
