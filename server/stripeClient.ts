/**
 * Stripe client initialization
 * Handles Stripe API client creation with proper error handling
 */

let StripeModule: any = null;
let stripeLoadAttempted = false;

/**
 * Lazy load Stripe module (only when needed)
 */
async function loadStripe(): Promise<any> {
  if (stripeLoadAttempted) {
    return StripeModule;
  }
  
  stripeLoadAttempted = true;
  
  try {
    const stripe = await import('stripe');
    StripeModule = stripe.default;
    return StripeModule;
  } catch (error) {
    console.warn('[Stripe] Stripe package not installed. Stripe features will be disabled.');
    return null;
  }
}

/**
 * Get Stripe client instance (uncachable - creates new instance each time)
 * Throws error if Stripe is not configured or not installed
 */
export async function getUncachableStripeClient(): Promise<any> {
  const Stripe = await loadStripe();
  
  if (!Stripe) {
    throw new Error('Stripe package not installed. Install with: npm install stripe');
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  
  if (!secretKey) {
    throw new Error('Stripe secret key not configured. Set STRIPE_SECRET_KEY environment variable.');
  }

  // Create a new instance each time (uncachable)
  return new Stripe(secretKey, {
    apiVersion: '2024-12-18.acacia',
    typescript: true,
  });
}

/**
 * Get Stripe publishable key
 * Throws error if Stripe is not configured
 */
export async function getStripePublishableKey(): Promise<string> {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  
  if (!key) {
    throw new Error('Stripe publishable key not configured. Set STRIPE_PUBLISHABLE_KEY environment variable.');
  }

  return key;
}
