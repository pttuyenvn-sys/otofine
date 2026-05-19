import "./rfq-scope.css";

export default function RfqLayout({ children }) {
  return (
    <div className="rfq-scope">
      <main>{children}</main>
    </div>
  );
}
