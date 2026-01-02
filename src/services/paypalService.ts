import { env } from '../config/env';
import { logger } from '../utils/logger';

// Log the environment on module load
logger.info('PayPal service initialized', {
  hasClientId: !!env.paypalClientId,
  hasClientSecret: !!env.paypalClientSecret,
  useSandbox: env.paypalUseSandbox,
  baseUrl: env.paypalClientId && env.paypalClientSecret
    ? (env.paypalUseSandbox ? 'https://api.sandbox.paypal.com' : 'https://api.paypal.com')
    : 'https://api.sandbox.paypal.com',
});

interface PayPalAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface PayPalCaptureDetails {
  id: string;
  status: 'COMPLETED' | 'PENDING' | 'DECLINED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  amount: {
    currency_code: string;
    value: string;
  };
  final_capture?: boolean;
  seller_protection?: {
    status: string;
  };
}

interface PayPalOrderResponse {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED';
  purchase_units: Array<{
    payments?: {
      captures?: PayPalCaptureDetails[];
    };
  }>;
}

const PAYPAL_BASE_URL = env.paypalClientId && env.paypalClientSecret
  ? (env.paypalUseSandbox ? 'https://api.sandbox.paypal.com' : 'https://api.paypal.com')
  : 'https://api.sandbox.paypal.com'; // Default to sandbox

let accessTokenCache: { token: string; expiresAt: number } | null = null;

const getAccessToken = async (retryCount = 0): Promise<string> => {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.token;
  }

  if (!env.paypalClientId || !env.paypalClientSecret) {
    throw new Error('PayPal credentials not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.');
  }

  const auth = Buffer.from(`${env.paypalClientId}:${env.paypalClientSecret}`).toString('base64');
  const maxRetries = 3;
  const retryDelay = 1000 * (retryCount + 1); // Exponential backoff: 1s, 2s, 3s

  try {
    logger.info('Requesting PayPal access token', { 
      baseUrl: PAYPAL_BASE_URL,
      clientIdPrefix: env.paypalClientId.substring(0, 10) + '...',
      useSandbox: env.paypalUseSandbox,
      retryAttempt: retryCount,
    });
    
    const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = errorText;
      }

      // Handle service unavailable with retry
      if (response.status === 503 || (errorData?.name === 'SERVICE_UNAVAILABLE' && retryCount < maxRetries)) {
        logger.warn('PayPal service unavailable, retrying', { 
          status: response.status, 
          error: errorData,
          retryCount,
          willRetryIn: retryDelay,
        });
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return getAccessToken(retryCount + 1);
      }

      logger.error('PayPal token request failed', { 
        status: response.status, 
        error: errorData,
        baseUrl: PAYPAL_BASE_URL,
      });
      throw new Error(`PayPal authentication failed: ${response.status}. Check that your PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are correct and match the environment (sandbox/production).`);
    }

    const data = (await response.json()) as PayPalAccessTokenResponse;
    accessTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000, // Refresh 60s before expiry
    };

    logger.info('PayPal access token obtained successfully', { 
      expiresIn: data.expires_in,
      baseUrl: PAYPAL_BASE_URL,
    });

    return data.access_token;
  } catch (error: any) {
    // Retry on network errors
    if (retryCount < maxRetries && (error.message.includes('fetch') || error.message.includes('network'))) {
      logger.warn('PayPal token fetch network error, retrying', { 
        error: error.message, 
        retryCount,
        willRetryIn: retryDelay,
      });
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return getAccessToken(retryCount + 1);
    }

    logger.error('PayPal token fetch error', { error: error.message, baseUrl: PAYPAL_BASE_URL });
    throw new Error(`Failed to authenticate with PayPal: ${error.message}`);
  }
};

export const verifyPayPalOrder = async (orderId: string, retryCount = 0): Promise<PayPalOrderResponse> => {
  const token = await getAccessToken();
  const maxRetries = 3;
  const retryDelay = 1000 * (retryCount + 1);

  try {
    logger.info('Fetching PayPal order', { orderId, baseUrl: PAYPAL_BASE_URL, retryAttempt: retryCount });
    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = errorText;
      }

      // Handle service unavailable with retry
      if ((response.status === 503 || errorData?.name === 'SERVICE_UNAVAILABLE') && retryCount < maxRetries) {
        logger.warn('PayPal service unavailable, retrying order verification', { 
          orderId,
          status: response.status, 
          error: errorData,
          retryCount,
          willRetryIn: retryDelay,
        });
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return verifyPayPalOrder(orderId, retryCount + 1);
      }

      logger.error('PayPal order verification failed', { 
        orderId, 
        status: response.status, 
        error: errorData,
        baseUrl: PAYPAL_BASE_URL,
      });

      if (errorData?.name === 'SERVICE_UNAVAILABLE') {
        throw new Error('PayPal service is currently unavailable. Please try again in a few moments.');
      }

      throw new Error(`PayPal order verification failed: ${response.status}`);
    }

    return (await response.json()) as PayPalOrderResponse;
  } catch (error: any) {
    // Retry on network errors
    if (retryCount < maxRetries && (error.message.includes('fetch') || error.message.includes('network'))) {
      logger.warn('PayPal order fetch network error, retrying', { 
        orderId,
        error: error.message, 
        retryCount,
        willRetryIn: retryDelay,
      });
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return verifyPayPalOrder(orderId, retryCount + 1);
    }

    logger.error('PayPal order fetch error', { orderId, error: error.message, baseUrl: PAYPAL_BASE_URL });
    throw new Error(`Failed to verify PayPal order: ${error.message}`);
  }
};

export const verifyPayPalCapture = async (captureId: string, retryCount = 0): Promise<PayPalCaptureDetails> => {
  const token = await getAccessToken();
  const maxRetries = 3;
  const retryDelay = 1000 * (retryCount + 1);

  try {
    logger.info('Fetching PayPal capture', { captureId, baseUrl: PAYPAL_BASE_URL, retryAttempt: retryCount });
    const response = await fetch(`${PAYPAL_BASE_URL}/v2/payments/captures/${captureId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = errorText;
      }
      
      // Handle service unavailable with retry
      if ((response.status === 503 || errorData?.name === 'SERVICE_UNAVAILABLE') && retryCount < maxRetries) {
        logger.warn('PayPal service unavailable, retrying capture verification', { 
          captureId,
          status: response.status, 
          error: errorData,
          retryCount,
          willRetryIn: retryDelay,
        });
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return verifyPayPalCapture(captureId, retryCount + 1);
      }
      
      logger.error('PayPal capture verification failed', { 
        captureId, 
        status: response.status, 
        error: errorData,
        baseUrl: PAYPAL_BASE_URL,
      });
      
      if (response.status === 404) {
        throw new Error(`PayPal capture not found (404). The capture ID ${captureId} does not exist in the ${env.paypalUseSandbox ? 'sandbox' : 'production'} environment. This usually means the frontend and backend are using different PayPal apps or accounts.`);
      }

      if (errorData?.name === 'SERVICE_UNAVAILABLE') {
        throw new Error('PayPal service is currently unavailable. Please try again in a few moments.');
      }
      
      throw new Error(`PayPal capture verification failed: ${response.status}`);
    }

    const captureData = (await response.json()) as PayPalCaptureDetails;
    logger.info('PayPal capture retrieved successfully', { 
      captureId, 
      status: captureData.status,
      amount: captureData.amount.value,
      currency: captureData.amount.currency_code,
    });
    
    return captureData;
  } catch (error: any) {
    // Retry on network errors
    if (retryCount < maxRetries && (error.message.includes('fetch') || error.message.includes('network'))) {
      logger.warn('PayPal capture fetch network error, retrying', { 
        captureId,
        error: error.message, 
        retryCount,
        willRetryIn: retryDelay,
      });
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return verifyPayPalCapture(captureId, retryCount + 1);
    }

    logger.error('PayPal capture fetch error', { captureId, error: error.message, baseUrl: PAYPAL_BASE_URL });
    throw error;
  }
};

export const verifyPayPalPayment = async (
  orderId: string,
  expectedAmount: number,
  expectedCurrency: string = 'GBP',
  captureId?: string,
): Promise<{ verified: boolean; captureDetails?: PayPalCaptureDetails; orderDetails?: PayPalOrderResponse }> => {
  let captureDetails: PayPalCaptureDetails | null = null;
  let orderDetails: PayPalOrderResponse | null = null;

  logger.info('Starting PayPal payment verification', {
    orderId,
    captureId,
    expectedAmount,
    expectedCurrency,
    environment: env.paypalUseSandbox ? 'sandbox' : 'production',
    baseUrl: PAYPAL_BASE_URL,
  });

  // Strategy 1: If we have a captureId, verify it directly (most reliable)
  if (captureId) {
    try {
      logger.info('Attempting capture verification', { captureId });
      captureDetails = await verifyPayPalCapture(captureId);
      
      if (captureDetails.status !== 'COMPLETED') {
        logger.warn('PayPal capture not completed', { captureId, status: captureDetails.status });
        return { verified: false, captureDetails };
      }

      // Verify amount and currency from capture
      const capturedAmount = parseFloat(captureDetails.amount.value);
      const capturedCurrency = captureDetails.amount.currency_code;

      logger.info('Capture details retrieved', {
        captureId,
        status: captureDetails.status,
        amount: capturedAmount,
        currency: capturedCurrency,
      });

      if (capturedCurrency !== expectedCurrency) {
        logger.warn('Currency mismatch', { expected: expectedCurrency, actual: capturedCurrency });
        return { verified: false, captureDetails };
      }

      const amountDifference = Math.abs(capturedAmount - expectedAmount);
      if (amountDifference > 0.01) {
        logger.warn('Amount mismatch', { 
          expected: expectedAmount, 
          actual: capturedAmount, 
          difference: amountDifference 
        });
        return { verified: false, captureDetails };
      }

      // Try to get order details for logging (optional, don't fail if it doesn't work)
      try {
        orderDetails = await verifyPayPalOrder(orderId);
        logger.info('Order details also retrieved successfully', { orderId });
      } catch (orderError: any) {
        logger.warn('Could not fetch order details, but capture is valid', { 
          orderId, 
          captureId,
          orderError: orderError.message 
        });
        // Continue with capture verification only - this is fine
      }

      logger.info('PayPal payment verified successfully via capture', { 
        orderId, 
        captureId: captureDetails.id, 
        amount: capturedAmount 
      });
      return { verified: true, captureDetails, orderDetails: orderDetails || undefined };
    } catch (captureError: any) {
      logger.warn('Capture verification failed', { 
        captureId, 
        error: captureError.message,
        willTryOrderVerification: true
      });
      // Fall through to order verification as backup
    }
  }

  // Strategy 2: Verify via order ID (fallback or primary if no captureId)
  try {
    logger.info('Attempting order verification', { orderId });
    orderDetails = await verifyPayPalOrder(orderId);

    if (orderDetails.status !== 'COMPLETED') {
      logger.warn('PayPal order not completed', { orderId, status: orderDetails.status });
      return { verified: false, orderDetails };
    }

    // Get capture from order
    const captures = orderDetails.purchase_units?.[0]?.payments?.captures;
    if (!captures || captures.length === 0) {
      logger.warn('No captures found in PayPal order', { orderId });
      return { verified: false, orderDetails };
    }

    captureDetails = captures[0];
    if (captureDetails.status !== 'COMPLETED') {
      logger.warn('PayPal capture not completed', { 
        captureId: captureDetails.id, 
        status: captureDetails.status 
      });
      return { verified: false, captureDetails, orderDetails };
    }

    // Verify amount and currency
    const capturedAmount = parseFloat(captureDetails.amount.value);
    const capturedCurrency = captureDetails.amount.currency_code;

    if (capturedCurrency !== expectedCurrency) {
      logger.warn('Currency mismatch', { expected: expectedCurrency, actual: capturedCurrency });
      return { verified: false, captureDetails, orderDetails };
    }

    const amountDifference = Math.abs(capturedAmount - expectedAmount);
    if (amountDifference > 0.01) {
      logger.warn('Amount mismatch', { 
        expected: expectedAmount, 
        actual: capturedAmount, 
        difference: amountDifference 
      });
      return { verified: false, captureDetails, orderDetails };
    }

    logger.info('PayPal payment verified successfully via order', { 
      orderId, 
      captureId: captureDetails.id, 
      amount: capturedAmount 
    });
    return { verified: true, captureDetails, orderDetails };
  } catch (orderError: any) {
    // If both capture and order verification failed
    const is404 = orderError.message.includes('404') || orderError.message.includes('RESOURCE_NOT_FOUND');
    
    if (is404) {
      const errorMessage = captureId
        ? `Payment verification failed: Both capture (${captureId}) and order (${orderId}) not found in PayPal. This indicates an environment mismatch - the payment was created with different PayPal credentials than the server is using. Please ensure your frontend PayPal Client ID and backend PayPal credentials are from the same PayPal app and environment (both sandbox or both production).`
        : `Payment verification failed: Order (${orderId}) not found in PayPal. This may happen if the order was created in a different environment (sandbox vs production). Please ensure your PayPal credentials match the environment used for payment.`;
      
      logger.error('PayPal resource not found', { 
        orderId, 
        captureId,
        error: orderError.message,
        environment: env.paypalUseSandbox ? 'sandbox' : 'production',
        baseUrl: PAYPAL_BASE_URL,
      });
      
      throw new Error(errorMessage);
    }
    throw orderError;
  }
};

