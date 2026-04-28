export default function AuthCard({ title, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6f8] px-4">
      <div className="w-full max-w-md bg-white p-10 rounded-3xl shadow-lg border border-[#e5e7eb]">
        <h2 className="text-center text-2xl font-semibold text-gray-800 mb-8">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
