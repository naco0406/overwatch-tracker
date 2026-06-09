import { supabase } from '@/supabase/client';
import type { Database } from '@/supabase/database.types';
import type { CompetitiveSeason } from '@/types/competitiveSeason';

type CompetitiveSeasonRow = Database['public']['Tables']['competitive_seasons']['Row'];

const rowToCompetitiveSeason = (row: CompetitiveSeasonRow): CompetitiveSeason => ({
  displayName: row.display_name,
  endsAt: row.ends_at,
  id: row.id,
  seasonNumber: row.season_number,
  startsAt: row.starts_at,
  year: row.year,
});

export const listCompetitiveSeasons = async () => {
  const { data, error } = await supabase
    .from('competitive_seasons')
    .select('*')
    .order('starts_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(rowToCompetitiveSeason);
};
