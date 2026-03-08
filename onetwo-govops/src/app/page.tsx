import { headers } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function Home() {
  const headersList = await headers()
  const hostname = headersList.get('host') || ''
  const isAdminDomain = hostname.startsWith('admin.')

  // admin.getonetwo.com → redirect to admin dashboard (auth checked in middleware)
  if (isAdminDomain) {
    redirect('/admin/dashboard')
  }

  // Main domain — check if logged in user, smart redirect
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('platform_users')
      .select('platform_role')
      .eq('id', user.id)
      .single()

    if (profile?.platform_role === 'platform_admin') {
      redirect('/admin/dashboard')
    }

    const { data: tenantUser } = await supabase
      .from('tenant_users')
      .select('tenancy_id, tenancies(slug)')
      .eq('auth_user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .single()

    if (tenantUser?.tenancies) {
      const tenancies = tenantUser.tenancies as { slug: string }
      redirect(`/app/${tenancies.slug}`)
    }
  }

  // Not logged in on main domain → show landing page
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-serif text-2xl font-bold text-[#c42030]">ONE</span>
            <span className="font-serif text-2xl font-light text-stone-800">two</span>
            <span className="text-xs text-stone-400 ml-2 uppercase tracking-wider">GovOps</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/login" className="text-sm text-stone-600 hover:text-stone-900">
              Log In
            </Link>
            <Link href="/login" className="text-sm bg-[#c42030] text-white px-4 py-2 rounded-lg hover:bg-[#a31b28] transition-colors">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <h1 className="font-serif text-5xl font-bold text-stone-900 leading-tight">
          Modern Governance for<br />Community Associations
        </h1>
        <p className="mt-6 text-xl text-stone-600 max-w-2xl mx-auto">
          Board management, compliance tracking, financial oversight, and resident engagement — all in one platform built for HOAs and condo associations.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/login" className="bg-[#c42030] text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-[#a31b28] transition-colors">
            Start Free Trial
          </Link>
          <Link href="#plans" className="border border-stone-300 text-stone-700 px-8 py-3 rounded-lg text-lg font-medium hover:bg-stone-50 transition-colors">
            View Plans
          </Link>
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="bg-stone-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-serif text-3xl font-bold text-center text-stone-900 mb-12">Subscription Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: 'Compliance Pro', price: '$179', color: '#2563eb', desc: 'Full governance engine for serious boards' },
              { name: 'Community Plus', price: '$249', color: '#059669', desc: 'Everything in Compliance Pro plus community engagement' },
              { name: 'Management Suite', price: '$399', color: '#7c3aed', desc: 'Professional property management tools' },
            ].map((plan) => (
              <div key={plan.name} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <div className="h-1" style={{ backgroundColor: plan.color }} />
                <div className="p-6">
                  <h3 className="font-serif text-xl font-bold text-stone-900">{plan.name}</h3>
                  <p className="text-stone-500 mt-1 text-sm">{plan.desc}</p>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-stone-900">{plan.price}</span>
                    <span className="text-stone-500">/mo</span>
                  </div>
                  <Link href="/login" className="mt-6 block text-center bg-stone-900 text-white py-2 rounded-lg hover:bg-stone-800 transition-colors">
                    Get Started
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-stone-500">
          &copy; {new Date().getFullYear()} ONE two GovOps. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
