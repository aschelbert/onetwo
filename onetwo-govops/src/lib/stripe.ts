import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('Missing STRIPE_SECRET_KEY')
    _stripe = new Stripe(key, { typescript: true })
  }
  return _stripe
}

// Convenience proxy so existing imports still work
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as never)[prop as string]
  },
})
