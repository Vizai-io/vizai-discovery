"use client";

/**
 * @fileOverview Auth context — Supabase Auth implementation.
 *
 * Replaces the Firebase Auth implementation. Public interface is identical
 * to the previous version — all consumers of useAuth() are unaffected.
 *
 * Auth flow:
 * 1. Supabase handles sign-in/sign-up and sets httpOnly session cookies
 * 2. onAuthStateChange fires → we call GET /api/auth/me to resolve the
 *    user's role and organizationId from Postgres
 * 3. userProfile is populated and available to all client components
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { UserProfile } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
    companyName: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(): Promise<UserProfile | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      uid: data.uid,
      email: data.email,
      role: data.role,
      organizationId: data.organizationId,
      displayName: data.displayName ?? undefined,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  // Prevent double-fetching profile on rapid auth state changes
  const profileFetchController = useRef<AbortController | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile().then((profile) => {
          setUserProfile(profile);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      const newUser = session?.user ?? null;
      setUser(newUser);

      if (newUser) {
        // Cancel any in-flight profile fetch
        profileFetchController.current?.abort();
        profileFetchController.current = new AbortController();

        fetchProfile().then((profile) => {
          setUserProfile(profile);
          setLoading(false);
        });
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // onAuthStateChange will fire and update user + profile
  }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      _companyName: string, // org creation is admin-managed in the new model
    ) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: displayName },
        },
      });
      if (error) throw error;
      // User is provisioned in Postgres on first /api/auth/me call (auto-provisioning)
    },
    [supabase], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const signOut = useCallback(async () => {
    await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    await supabase.auth.signOut();
    setUser(null);
    setUserProfile(null);
  }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{ user, userProfile, loading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
