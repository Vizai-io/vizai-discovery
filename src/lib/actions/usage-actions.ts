
'use server';

/**
 * @fileOverview Server Actions for rate limiting and abuse protection.
 */

import { headers } from 'next/headers';
import { db } from '@/lib/firebase-config';
import { doc, getDoc, setDoc, increment, serverTimestamp } from 'firebase/firestore';

export type UsageValidationResult = {
  allowed: boolean;
  reason?: string;
};

/**
 * Validates a free scan request based on IP and email rate limits.
 * Implements honeypot protection against bots.
 */
export async function validateFreeScanRequest(email: string, honeypot: string): Promise<UsageValidationResult> {
  // 1. Honeypot Check (Simple abuse protection)
  if (honeypot && honeypot.length > 0) {
    console.warn(`Abuse detected: Honeypot field filled by ${email}`);
    return { allowed: false, reason: "Security validation failed. Please try again." };
  }

  const headerList = await headers();
  const ip = headerList.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Keys for tracking
  const emailKey = `email_${email.toLowerCase().trim()}_${today}`;
  const ipKey = `ip_${ip.replace(/\./g, '_')}_${today}`;

  try {
    // 2. Check Email Limit (1 per day)
    const emailDoc = await getDoc(doc(db, "usageTracking", emailKey));
    if (emailDoc.exists() && emailDoc.data().count >= 1) {
      return { 
        allowed: false, 
        reason: "Daily limit reached for this email. Sign in to run unlimited scans." 
      };
    }

    // 3. Check IP Limit (3 per day)
    const ipDoc = await getDoc(doc(db, "usageTracking", ipKey));
    if (ipDoc.exists() && ipDoc.data().count >= 3) {
      return { 
        allowed: false, 
        reason: "Daily limit reached for this network. Please try again tomorrow or sign in." 
      };
    }

    // 4. Record Usage
    // Note: In a high-traffic production app, use a Firestore transaction or Batch
    await setDoc(doc(db, "usageTracking", emailKey), {
      count: increment(1),
      lastUpdated: serverTimestamp(),
      type: 'email',
      identifier: email.toLowerCase()
    }, { merge: true });

    await setDoc(doc(db, "usageTracking", ipKey), {
      count: increment(1),
      lastUpdated: serverTimestamp(),
      type: 'ip',
      identifier: ip
    }, { merge: true });

    return { allowed: true };

  } catch (error) {
    console.error("Rate limit check error:", error);
    // Fail open for UX, but log error. Alternatively fail closed for security.
    return { allowed: true }; 
  }
}
