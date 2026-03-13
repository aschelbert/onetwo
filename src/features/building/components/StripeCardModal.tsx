import { useEffect, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { supabase } from '@/lib/supabase';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

interface StripeCardModalProps {
  clientSecret: string;
  customerId: string;
  onSuccess: (cardLast4: string, cardBrand: string, paymentMethodId: string) => void;
  onClose: () => void;
}

export default function StripeCardModal({ clientSecret, customerId, onSuccess, onClose }: StripeCardModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const cardElementRef = useRef<any>(null);
  const stripeRef = useRef<any>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function mount() {
      const stripe = await stripePromise;
      if (!stripe || !mounted || !cardRef.current) return;

      stripeRef.current = stripe;
      const elements = stripe.elements({ clientSecret });
      const card = elements.create('card', {
        style: {
          base: {
            fontSize: '15px',
            color: '#1a1a2e',
            fontFamily: '"DM Sans", system-ui, sans-serif',
            '::placeholder': { color: '#9ca3af' },
          },
          invalid: { color: '#dc2626' },
        },
      });
      card.mount(cardRef.current);
      cardElementRef.current = card;

      card.on('ready', () => { if (mounted) setReady(true); });
      card.on('change', (e: any) => {
        if (mounted) setError(e.error?.message || '');
      });
    }

    mount();

    return () => {
      mounted = false;
      cardElementRef.current?.destroy();
    };
  }, [clientSecret]);

  const handleSubmit = async () => {
    const stripe = stripeRef.current;
    const card = cardElementRef.current;
    if (!stripe || !card) return;

    setSaving(true);
    setError('');

    // Confirm the SetupIntent with the card element
    const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card },
    });

    if (confirmError) {
      setError(confirmError.message || 'Card setup failed');
      setSaving(false);
      return;
    }

    const paymentMethodId = setupIntent.payment_method;

    // Save the payment method server-side
    try {
      const { data, error: fnError } = await supabase!.functions.invoke('mailing-billing', {
        body: {
          action: 'save-payment-method',
          paymentMethodId,
          customerId,
        },
      });

      if (fnError || data?.error) {
        setError(data?.error || fnError?.message || 'Failed to save payment method');
        setSaving(false);
        return;
      }

      onSuccess(data.cardLast4, data.cardBrand, data.paymentMethodId);
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
            <h3 className="text-base font-bold text-ink-900">Add Payment Method</h3>
            <button onClick={onClose} className="text-ink-400 hover:text-ink-600 text-lg leading-none">&times;</button>
          </div>

          <div className="px-5 py-5 space-y-4">
            <p className="text-xs text-ink-500">
              This card will be charged for mailing costs each time a letter is sent.
            </p>

            {/* Card Element mount point */}
            <div className="border border-ink-200 rounded-lg px-3 py-3">
              <div ref={cardRef} />
            </div>

            {error && (
              <p className="text-xs text-red-600 font-medium">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 px-5 py-4 border-t border-ink-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-ink-600 hover:text-ink-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !ready}
              className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Card'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
