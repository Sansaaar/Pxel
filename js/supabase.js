const SUPABASE_URL = "https://qdnfydzxhaudpnliwhui.supabase.co";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbmZ5ZHp4aGF1ZHBubGl3aHVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDc4MjcsImV4cCI6MjA5ODQ4MzgyN30.xSkqnRtjs8W20zP-FwKUOOagy3I4By6iOOEfWPRhJTY";

// Create the client from the library
window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

console.log("Client:", window.supabaseClient);
console.log("Auth:", window.supabaseClient.auth);