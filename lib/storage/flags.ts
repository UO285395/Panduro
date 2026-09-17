/**
 * Flags de modo compartidos entre server y client.
 * El env `NEXT_PUBLIC_DEMO_MODE=1` activa la persistencia en localStorage sin
 * Supabase y salta la comprobación de auth del middleware.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";
