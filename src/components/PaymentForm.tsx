import React, { useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { cn } from '../lib/utils';
import { CheckCircle2 } from 'lucide-react';

export function PaymentForm({ 
  onSuccess, 
  onCancel, 
  amount 
}: { 
  onSuccess: (method: string) => void; 
  onCancel: () => void; 
  amount: number;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    // In a real app, you might specify a return_url here.
    // For SPA, we can intercept if it doesn't require a redirect,
    // but PSE requires redirect. If we want no-redirect for cards:
    // Actually, Stripe requires return_url if redirect is 'always' or method requires it.
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required', // Avoid redirect if possible
      confirmParams: {
        return_url: window.location.href, // If redirect happens, come back here
      },
    });

    if (error) {
      setErrorMessage(error.message || 'Ha ocurrido un error desconocido.');
      setIsProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      // Payment succeeded immediately
      setIsProcessing(false);
      onSuccess('tarjeta_stripe'); // Or depending on the method
    } else if (paymentIntent && paymentIntent.status === 'processing') {
      setIsProcessing(false);
      onSuccess('procesando');
    } else {
      setIsProcessing(false);
      setErrorMessage('Estado de pago inesperado.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <PaymentElement className="mb-6" />
      
      {errorMessage && (
        <div className="bg-error/10 text-error p-3 rounded-lg text-sm mb-4">
          {errorMessage}
        </div>
      )}

      <div className="flex gap-3">
        <button 
          type="button" 
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 btn-secondary py-3 text-sm disabled:opacity-50"
        >
          Cancelar
        </button>
        <button 
          type="submit" 
          disabled={!stripe || isProcessing}
          className="flex-1 btn-primary py-3 text-sm flex justify-center items-center gap-2 disabled:opacity-50"
        >
          {isProcessing ? 'Procesando...' : `Pagar \$${amount.toLocaleString()}`}
        </button>
      </div>
    </form>
  );
}
