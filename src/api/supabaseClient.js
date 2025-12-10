// Template Supabase client - adapt to your schema before using
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const Entities = {
  Dog: {
    list: async (sort = '-created_date', limit) => {
      const { data, error } = await supabase.from('dogs').select('*');
      if (error) throw error;
      return data;
    },
    create: async (payload) => {
      const { data, error } = await supabase.from('dogs').insert([payload]).select().single();
      if (error) throw error;
      return data;
    }
  }
};

export default supabase;
