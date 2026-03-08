'use client'

import { useState, useEffect, useTransition } from 'react'
import { StepShell } from '../shared/StepShell'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, ExternalLink, RefreshCw } from 'lucide-react'
import {
  initiateStripeConnect,
  checkStripeConnectStatus,
} from '@/app/app/onboarding/[tenancy]/actions'

interface Props {
  tenancyId: string
  tenancySlug: string
  initialSettings: any
}

export function Step6PaymentSetup({ tenancyId, tenancySlug, initialSettings }: Props) {
  const [stripeConnectId, setStripeConnectId] = useState<string | null>(
    initialSettings?.stripe_connect_id || null
  )
  const [isComplete, setIsComplete] = useState(
    initialSettings?.stripe_onboarding_complete || false
  )
  const [connecting, setConnecting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [, startTransition] = useTransition()

  // Check status on mount if we have a connect id but not complete
  useEffect(() => {
    if (stripeConnectId && !isComplete) {
      handleCheckStatus()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const returnUrl = `${window.location.origin}/app/onboarding/${tenancySlug}/step/6`
      const result = await initiateStripeConnect(tenancyId, returnUrl)
      if (result.onboardingUrl) {
        window.location.href = result.onboardingUrl
      }
    } catch (e) {
      console.error('Stripe Connect failed:', e)
      setConnecting(false)
    }
  }

  const handleCheckStatus = async () => {
    setChecking(true)
    try {
      const status = await checkStripeConnectStatus(tenancyId)
      if (status.charges_enabled && status.details_submitted) {
        setIsComplete(true)
      }
    } catch (e) {
      console.error('Status check failed:', e)
    } finally {
      setChecking(false)
    }
  }

  return (
    <StepShell
      stepNumber={6}
      totalSteps={8}
      title="Payment Setup"
      description="Connect Stripe to collect assessment payments from residents."
      required={false}
      tenancySlug={tenancySlug}
    >
      <Card>
        <CardBody>
          {isComplete ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-[#ecfdf5] flex items-center justify-center mx-auto mb-3">
                <Check size={24} className="text-[#047857]" />
              </div>
              <h3 className="text-[16px] font-semibold text-[#1a1f25] mb-1">
                Stripe Connected
              </h3>
              <p className="text-[13px] text-[#6e7b8a] mb-3">
                Your Stripe account is set up and ready to accept payments.
              </p>
              <Badge variant="green">Active</Badge>
            </div>
          ) : stripeConnectId ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-[#fef9c3] flex items-center justify-center mx-auto mb-3">
                <RefreshCw size={20} className="text-[#a16207]" />
              </div>
              <h3 className="text-[16px] font-semibold text-[#1a1f25] mb-1">
                Setup In Progress
              </h3>
              <p className="text-[13px] text-[#6e7b8a] mb-4">
                Your Stripe account has been created but setup is not yet complete.
                Return to Stripe to finish or check the status below.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button variant="accent" onClick={handleConnect} disabled={connecting}>
                  <ExternalLink size={14} /> {connecting ? 'Redirecting...' : 'Continue Setup on Stripe'}
                </Button>
                <Button variant="secondary" onClick={handleCheckStatus} disabled={checking}>
                  <RefreshCw size={14} /> {checking ? 'Checking...' : 'Check Status'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="mb-4">
                <div className="w-12 h-12 rounded-full bg-[#f0f0ff] flex items-center justify-center mx-auto mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.918 3.757 7.164c0 4.469 2.978 6.087 6.334 7.312 2.145.783 2.898 1.384 2.898 2.316 0 .97-.811 1.484-2.282 1.484-1.895 0-4.79-.951-6.735-2.25l-.89 5.549c1.689 1.062 4.614 1.925 7.625 1.925 2.626 0 4.787-.654 6.294-1.871 1.64-1.317 2.403-3.166 2.403-5.516C19.404 11.661 16.842 10.213 13.976 9.15z" fill="#635bff"/>
                  </svg>
                </div>
                <h3 className="text-[16px] font-semibold text-[#1a1f25] mb-2">
                  Connect with Stripe
                </h3>
                <p className="text-[13px] text-[#6e7b8a] max-w-md mx-auto leading-relaxed">
                  Stripe Connect enables your building to securely collect assessment payments,
                  late fees, and other charges from residents. Funds are deposited directly into
                  your association&apos;s bank account.
                </p>
              </div>

              <div className="bg-[#f8f9fa] rounded-lg p-4 mb-5 max-w-md mx-auto text-left">
                <p className="text-[11px] font-bold text-[#929da8] uppercase tracking-[0.08em] mb-2">What you&apos;ll need</p>
                <ul className="text-[12px] text-[#45505a] space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-[#929da8] mt-0.5">•</span>
                    <span>Bank account details (routing & account number)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#929da8] mt-0.5">•</span>
                    <span>Association EIN (Tax ID)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#929da8] mt-0.5">•</span>
                    <span>Authorized signer information</span>
                  </li>
                </ul>
              </div>

              <Button variant="accent" size="lg" onClick={handleConnect} disabled={connecting}>
                {connecting ? 'Connecting...' : 'Connect with Stripe →'}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </StepShell>
  )
}
