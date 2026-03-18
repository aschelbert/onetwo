export default function PayrollPage() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-8">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-4xl">&#x1F4B5;</span>
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-900">Payroll & 1099s</h1>
            <p className="text-sm text-ink-500">Manage building staff payroll and contractor 1099 filings</p>
          </div>
        </div>
        <div className="bg-mist-50 border border-mist-200 rounded-xl p-6 text-center">
          <p className="text-ink-600 font-medium mb-2">Coming Soon</p>
          <p className="text-sm text-ink-400">
            Payroll management and 1099 contractor tracking for your association is being built.
            You'll be able to manage staff compensation and generate tax documents.
          </p>
        </div>
      </div>
    </div>
  );
}
