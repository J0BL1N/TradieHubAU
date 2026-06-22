import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SavedItem {
  id: string;
  user_id: string;
  item_type: string;
  item_id: string;
  created_at: string;
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

/**
 * Toggle save state for an item.
 * If already saved, unsaves (deletes) it. If not, saves (inserts) it.
 * Returns { saved: true } if the item is now saved, { saved: false } if unsaved.
 */
export async function toggleSavedItem(itemType: string, itemId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { saved: false, error: new Error('Not authenticated') };

  // Check if already saved
  const { data: existing, error: checkErr } = await supabase
    .from('saved_items')
    .select('id')
    .eq('user_id', user.id)
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .maybeSingle();

  if (checkErr) return { saved: false, error: checkErr };

  if (existing) {
    // Already saved → unsave
    const { error: deleteErr } = await supabase
      .from('saved_items')
      .delete()
      .eq('id', existing.id);

    return { saved: false, error: deleteErr };
  } else {
    // Not saved → save
    const { error: insertErr } = await supabase
      .from('saved_items')
      .insert({ user_id: user.id, item_type: itemType, item_id: itemId });

    return { saved: true, error: insertErr };
  }
}

/**
 * Get the set of saved item IDs for the authenticated user (for a given item_type).
 * Useful for seeding initial saved state in a list view.
 */
export async function getSavedItemIds(itemType: string): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data } = await supabase
    .from('saved_items')
    .select('item_id')
    .eq('user_id', user.id)
    .eq('item_type', itemType);

  return new Set((data ?? []).map((row: { item_id: string }) => row.item_id));
}

/**
 * Check if a specific item is saved by the authenticated user.
 */
export async function isItemSaved(itemType: string, itemId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('saved_items')
    .select('id')
    .eq('user_id', user.id)
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .maybeSingle();

  return data !== null;
}
