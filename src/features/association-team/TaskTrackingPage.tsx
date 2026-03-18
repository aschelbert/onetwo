export default function TaskTrackingPage() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-8">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-4xl">&#x1F4CB;</span>
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-900">Task Tracking</h1>
            <p className="text-sm text-ink-500">Track and manage association tasks, action items, and follow-ups</p>
          </div>
        </div>
        <div className="bg-mist-50 border border-mist-200 rounded-xl p-6 text-center">
          <p className="text-ink-600 font-medium mb-2">Coming Soon</p>
          <p className="text-sm text-ink-400">
            Task tracking for your association team is being built. You'll be able to assign,
            track, and manage tasks across board members, staff, and property managers.
          </p>
        </div>
      </div>
    </div>
  );
}
