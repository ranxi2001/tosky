import referrals from "../data/referrals.json";

export type ReferralKey = keyof typeof referrals;
export type Referral = (typeof referrals)[ReferralKey];

export function getReferral(key: string | undefined): Referral | undefined {
  if (!key || !(key in referrals)) return undefined;
  return referrals[key as ReferralKey];
}

export function isReferralKey(key: string): key is ReferralKey {
  return key in referrals;
}
