import { useSearchParams } from 'react-router-dom';

/**
 * Where Stripe sends a vendor or outside party after the Pay button on an
 * emailed invoice. They have no account, so the page asks for none and shows
 * nothing about the building: only whether the payment went through.
 */
export default function InvoicePaidPage() {
  const [params] = useSearchParams();
  const paid = params.get('status') === 'success';
  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-ink-50 via-white to-mist-50 flex items-center justify-center overflow-y-auto py-8">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8 text-center">
          <div className="flex items-center justify-center mb-6">
            <img src="/onetwo-wordmark-dark.jpg" alt="ONE two" className="h-14 object-contain rounded-lg" />
          </div>
          <h1 className="text-xl font-bold text-ink-900 mb-2">{paid ? 'Payment received' : 'Payment not completed'}</h1>
          <p className="text-sm text-ink-600">
            {paid
              ? 'Thank you. Your payment was received and the invoice is being marked as paid. Stripe has emailed you a receipt; you can close this page.'
              : 'No payment was taken. The Pay button in the invoice email still works whenever you are ready.'}
          </p>
        </div>
      </div>
    </div>
  );
}
