import { withAdminAuth, logAudit } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const { plan_id } = await req.json()
    const { data: plan } = await db
      .from('subscription_plans')
      .select('*')
      .eq('id', plan_id)
      .single()
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

    let productId = plan.stripe_product_id
    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description || undefined,
        metadata: { onetwo_plan_id: plan.id },
      })
      productId = product.id
    } else {
      await stripe.products.update(productId, {
        name: plan.name,
        description: plan.description || undefined,
      })
    }

    const monthlyPrice = await stripe.prices.create({
      product: productId,
      unit_amount: plan.price_monthly,
      currency: 'usd',
      recurring: { interval: 'month' },
    })
    const yearlyPrice = await stripe.prices.create({
      product: productId,
      unit_amount: plan.price_yearly,
      currency: 'usd',
      recurring: { interval: 'year' },
    })

    await db.from('subscription_plans').update({
      stripe_product_id: productId,
      stripe_price_monthly_id: monthlyPrice.id,
      stripe_price_yearly_id: yearlyPrice.id,
      stripe_sync_status: 'synced' as const,
      stripe_synced_at: new Date().toISOString(),
    }).eq('id', plan_id)

    await logAudit(email, 'stripe.sync_completed', 'subscription', plan_id, `Synced ${plan.name} to Stripe (${productId})`)
    return NextResponse.json({
      product_id: productId,
      monthly_price_id: monthlyPrice.id,
      yearly_price_id: yearlyPrice.id,
    })
  })
}
