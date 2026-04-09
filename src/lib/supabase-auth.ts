import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase-client";

function getHomeRedirectUrl() {
  return `${window.location.origin}${import.meta.env.BASE_URL}home`;
}

export async function signInWithSupabaseGoogle() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase auth is not configured");
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client is unavailable");
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // Return the OAuth URL so the caller can explicitly navigate.
      skipBrowserRedirect: true,
      redirectTo: getHomeRedirectUrl(),
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
      scopes: "openid email profile https://www.googleapis.com/auth/calendar",
    },
  });

  if (error) {
    throw error;
  }

  if (!data?.url) {
    throw new Error("Supabase did not return an OAuth redirect URL");
  }

  return data.url;
}

export async function getSupabaseSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session;
}

export async function signOutSupabase() {
  if (!isSupabaseConfigured) {
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

export function onSupabaseAuthChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return () => undefined;
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback);

  return () => {
    subscription.unsubscribe();
  };
}
