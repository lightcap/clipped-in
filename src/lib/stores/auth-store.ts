import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthState {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isPelotonConnected: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsPelotonConnected: (connected: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  isPelotonConnected: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) =>
    set({
      profile,
      isPelotonConnected: !!profile?.peloton_user_id,
    }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsPelotonConnected: (connected) => set({ isPelotonConnected: connected }),
  reset: () =>
    set({
      user: null,
      profile: null,
      isLoading: false,
      isPelotonConnected: false,
    }),
}));
