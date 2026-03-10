'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/lib/tenant-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Plan {
  id: string
  name: string
  slug: string
  description: string | null
  price_monthly: number
  price_yearly: number
  color: string | null
}

interface Tenancy {
  id: string
  name: string
  slug: string
  status: string
  billing_cycle: string
  subscription_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_sub_status: string | null
  trial_ends_at: string | null
  last_payment_at: string | null
  created_at: string
}

const STATUS_BADGE: Record<string, { label: string; variant: 'green' | 'amber' | 'blue' | 'red' | 'gray' }> = {
  active: { label: 'Active', variant: 'green' },
  trial: { label: 'Trial', variant: 'blue' },
  suspended: { label: 'Suspended', variant: 'red' },
  churned: { label: 'Canceled', variant: 'gray' },
}

export function AccountMgmtClient({
  tenancy,
  plan,
}: {
  tenancy: Tenancy
  plan: Plan | null
}) {
  const router = useRouter()
  const { user } = useTenant()
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const statusInfo = STATUS_BADGE[tenancy.status] || STATUS_BADGE.active
  const isTrialing = tenancy.status === 'trial'
  const isCanceled = tenancy.status === 'churned'
  const price = tenancy.billing_cycle === 'yearly' && plan
    ? plan.price_yearly
    : plan?.price_monthly ?? 0
  const interval = tenancy.billing_cycle === 'yearly' ? 'year' : 'month'

  const trialDaysLeft = tenancy.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(tenancy.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  async function handleCancel() {
    setCanceling(true)
    setCancelError(null)
    try {
      const res = await fetch('/api/tenant/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenancy_id: tenancy.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        setCancelError(data.error || 'Failed to cancel subscription')
        return
      }
      setShowCancelDialog(false)
      router.refresh()
    } finally {
      setCanceling(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="font-serif text-2xl font-bold text-stone-900">Account Management</h2>
        <p className="text-sm text-stone-500 mt-1">View your subscription and manage your account</p>
      </div>

      {/* Current Plan Card */}
      <div
        className="bg-white rounded-[10px] border border-stone-200 overflow-hidden mb-4"
        style={{ borderTop: `3px solid ${plan?.color || '#999'}` }}
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">Current Plan</div>
              <h3 className="font-serif text-xl font-bold text-stone-900">{plan?.name || 'Unknown Plan'}</h3>
            </div>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>

          {plan?.description && (
            <p className="text-[0.85rem] text-stone-500 mb-5">{plan.description}</p>
          )}

          {/* Pricing */}
          <div className="flex items-baseline gap-1 mb-5">
            <span className="text-3xl font-bold text-stone-900">{formatCurrency(price)}</span>
            <span className="text-sm text-stone-500">/{interval}</span>
          </div>

          {/* Trial banner */}
          {isTrialing && trialDaysLeft !== null && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-sm font-medium text-blue-800">
                  {trialDaysLeft > 0
                    ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left in your trial`
                    : 'Your trial has ended'}
                </span>
              </div>
              {tenancy.trial_ends_at && (
                <p className="text-xs text-blue-600 mt-1 ml-4">
                  Trial ends {formatDate(tenancy.trial_ends_at)}
                </p>
              )}
            </div>
          )}

          {/* Canceled banner */}
          {isCanceled && (
            <div className="bg-stone-100 border border-stone-200 rounded-lg px-4 py-3 mb-5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-stone-400" />
                <span className="text-sm font-medium text-stone-700">
                  This subscription has been canceled
                </span>
              </div>
            </div>
          )}

          {/* Subscription details */}
          <div className="border-t border-stone-100 pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Billing cycle</span>
              <span className="text-stone-800 font-medium capitalize">{tenancy.billing_cycle}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Member since</span>
              <span className="text-stone-800 font-medium">{formatDate(tenancy.created_at)}</span>
            </div>
            {tenancy.last_payment_at && (
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Last payment</span>
                <span className="text-stone-800 font-medium">{formatDate(tenancy.last_payment_at)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cancel Section */}
      {!isCanceled && (
        <div className="bg-white rounded-[10px] border border-stone-200 p-6">
          <h4 className="text-sm font-semibold text-stone-800 mb-1">Cancel Subscription</h4>
          <p className="text-[0.82rem] text-stone-500 mb-4">
            {isTrialing
              ? 'Cancel your trial. You will lose access to all features immediately.'
              : 'Your subscription will remain active until the end of the current billing period.'}
          </p>
          <Button variant="danger" size="sm" onClick={() => setShowCancelDialog(true)}>
            Cancel Subscription
          </Button>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <Dialog
        open={showCancelDialog}
        onClose={() => { setShowCancelDialog(false); setCancelError(null) }}
        title="Cancel Subscription"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowCancelDialog(false); setCancelError(null) }}>
              Keep Subscription
            </Button>
            <Button variant="danger" onClick={handleCancel} disabled={canceling}>
              {canceling ? 'Canceling...' : 'Confirm Cancellation'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-stone-700">
            Are you sure you want to cancel your <strong>{plan?.name}</strong> subscription for <strong>{tenancy.name}</strong>?
          </p>
          {isTrialing ? (
            <p className="text-sm text-stone-500">
              Your trial will end immediately and you will lose access to all features.
            </p>
          ) : (
            <p className="text-sm text-stone-500">
              You will continue to have access until the end of your current billing period. After that, your account will be deactivated.
            </p>
          )}
          {cancelError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-sm text-red-700">{cancelError}</p>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  )
}
