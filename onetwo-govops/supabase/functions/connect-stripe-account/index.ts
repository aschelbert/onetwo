import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { action = 'create', tenancy_id, return_url } = await req.json()

    if (!tenancy_id) {
      return new Response(JSON.stringify({ error: 'tenancy_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fetch existing financial settings
    const { data: settings } = await supabaseAdmin
      .from('financial_settings')
      .select('stripe_connect_id, stripe_onboarding_complete')
      .eq('tenancy_id', tenancy_id)
      .maybeSingle()

    if (action === 'check_status') {
      if (!settings?.stripe_connect_id) {
        return new Response(JSON.stringify({
          charges_enabled: false,
          details_submitted: false,
        }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const account = await stripe.accounts.retrieve(settings.stripe_connect_id)
      const charges_enabled = account.charges_enabled ?? false
      const details_submitted = account.details_submitted ?? false

      // Update if complete
      if (charges_enabled && details_submitted && !settings.stripe_onboarding_complete) {
        await supabaseAdmin
          .from('financial_settings')
          .update({ stripe_onboarding_complete: true, updated_at: new Date().toISOString() })
          .eq('tenancy_id', tenancy_id)
      }

      return new Response(JSON.stringify({ charges_enabled, details_submitted }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // action === 'create'
    let accountId = settings?.stripe_connect_id

    if (!accountId) {
      // Fetch tenancy details for business profile
      const { data: tenancy } = await supabaseAdmin
        .from('tenancies')
        .select('name')
        .eq('id', tenancy_id)
        .single()

      const account = await stripe.accounts.create({
        type: 'standard',
        business_profile: {
          name: tenancy?.name || undefined,
        },
      })

      accountId = account.id

      // Upsert financial settings with the new account ID
      await supabaseAdmin
        .from('financial_settings')
        .upsert({
          tenancy_id,
          stripe_connect_id: accountId,
          stripe_onboarding_complete: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenancy_id' })
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: return_url || `${Deno.env.get('SUPABASE_URL')}/`,
      return_url: return_url || `${Deno.env.get('SUPABASE_URL')}/`,
      type: 'account_onboarding',
    })

    return new Response(JSON.stringify({
      accountId,
      onboardingUrl: accountLink.url,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Stripe Connect error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
