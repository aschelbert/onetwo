import { withTenantAuth, logAudit } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { tenancy_id } = await req.json()

  if (!tenancy_id) {
    return NextResponse.json({ error: 'Missing tenancy_id' }, { status: 400 })
  }

  return withTenantAuth(tenancy_id, async (db, tenancyId, userId, userName) => {
    // Get tenancy details
    const { data: tenancy } = await db
      .from('tenancies')
      .select('id, name, stripe_subscription_id, status')
      .eq('id', tenancyId)
      .single()

    if (!tenancy) {
      return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
    }

    if (tenancy.status === 'churned') {
      return NextResponse.json({ error: 'Subscription is already canceled' }, { status: 400 })
    }

    // Cancel via Stripe if there's a Stripe subscription
    if (tenancy.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(tenancy.stripe_subscription_id)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Stripe error'
        return NextResponse.json({ error: `Failed to cancel with Stripe: ${message}` }, { status: 500 })
      }
    }

    // Update tenancy status
    await db
      .from('tenancies')
      .update({
        status: 'churned' as const,
        stripe_sub_status: 'canceled' as const,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenancyId)

    await logAudit(
      userName,
      'subscription.canceled',
      'tenancy',
      tenancyId,
      `${userName} canceled subscription for ${tenancy.name}`
    )

    return NextResponse.json({ success: true })
  })
}
