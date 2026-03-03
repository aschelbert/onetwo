const MODULE_PAGES: Record<string, React.ComponentType<unknown>> = {
  // 'board-room': BoardRoomPage,
  // 'board-room/meetings': MeetingsPage,
  // 'fiscal-lens/budget': BudgetPage,
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ tenancy: string; slug: string[] }>
}) {
  const { slug } = await params
  const path = slug.join('/')

  const PageComponent = MODULE_PAGES[path]

  if (!PageComponent) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-stone-800">
            {slug[slug.length - 1]?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </h2>
          <p className="text-stone-500 mt-2">This module is coming soon.</p>
        </div>
      </div>
    )
  }

  return <PageComponent />
}
