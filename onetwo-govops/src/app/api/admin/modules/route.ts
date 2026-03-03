import { withAdminAuth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  return withAdminAuth(async (db) => {
    const [{ data: modules }, { data: submodules }, { data: features }] = await Promise.all([
      db.from('modules').select('*').order('sort_order'),
      db.from('submodules').select('*').order('sort_order'),
      db.from('features').select('*').order('sort_order'),
    ])
    const hierarchy = modules?.map((m: Record<string, unknown>) => ({
      ...m,
      submodules: submodules
        ?.filter((sm: Record<string, unknown>) => sm.module_id === m.id)
        .map((sm: Record<string, unknown>) => ({
          ...sm,
          features: sm.is_leaf ? [] : features?.filter((f: Record<string, unknown>) => f.submodule_id === sm.id) || [],
        })) || [],
    }))
    return NextResponse.json(hierarchy)
  })
}
