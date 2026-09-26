// ==========================================
// Pixel AI: Authentication & Session Guard
// ==========================================

const client = window.supabaseClient;

async function checkSession() {
    try {
        if (!client) {
            console.warn("[Pixel Auth] Supabase client not initialized.");
            return;
        }

        const { data, error } = await client.auth.getSession();

        if (error) {
            console.error("[Pixel Auth] Session check error:", error);
        }

        if (data && data.session) {
            window.currentUser = data.session.user;
            localStorage.removeItem("pixel-guest");
            console.log("[Pixel Auth] Active session:", data.session.user.email);
            return;
        }

        // Check if user chose to continue as guest
        const isGuest = localStorage.getItem("pixel-guest") === "true";
        if (isGuest) {
            window.currentUser = {
                id: "guest-user",
                email: "guest@pixel.local",
                user_metadata: {
                    display_name: "Guest Explorer"
                }
            };
            console.log("[Pixel Auth] Running in Guest mode.");
            return;
        }

        // Otherwise redirect to login
        window.location.href = "login.html";

    } catch (err) {
        console.error("[Pixel Auth] Unexpected error during session check:", err);
    }
}

checkSession();