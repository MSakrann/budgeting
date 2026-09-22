export const MINI_IEC_BELOW_EGP = 2_000_000;

export function iecTier(requestedEgp: number): "mini" | "full" {
  return requestedEgp < MINI_IEC_BELOW_EGP ? "mini" : "full";
}
