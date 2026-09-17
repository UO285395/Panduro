// Placeholder para tipos generados con:
//   pnpm dlx supabase gen types typescript --project-id <ID> > lib/supabase/types.ts
// Se irá reemplazando conforme el esquema evolucione.

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          mcer_level: string;
          ui_locale: string;
          hearts: number;
          hearts_regen_at: string | null;
          streak_days: number;
          streak_last_day: string | null;
          xp_total: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
