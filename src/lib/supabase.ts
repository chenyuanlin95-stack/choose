import {createClient} from '@supabase/supabase-js';

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

const url=import.meta.env.VITE_SUPABASE_URL??'';
const key=import.meta.env.VITE_SUPABASE_ANON_KEY??'';
export const configured=Boolean(url&&key);
// A client is always exported so TypeScript can safely use it. UI actions stay disabled until configured.
export const supabase=createClient(url||'https://placeholder.supabase.co',key||'placeholder');
