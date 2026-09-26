// ==========================================
// Pixel AI: Authentication & Session Guard
// ==========================================

const client = window.supabaseClient;
const authNavigation = window.pixelAuthNavigation;

function redirectToLogin(extraParams = {}) {
    const returnTo = authNavigation?.currentAppPath() || "/";
    window.location.replace(authNavigation?.loginUrl(returnTo, extraParams) || "login.html");
}

function finishAuthRedirect() {
    const returnTo = authNavigation?.requestedReturnTo();
    if (returnTo && returnTo !== authNavigation.currentAppPath()) {
        window.location.replace(returnTo);
        return true;
    }
    return false;
}

function setCurrentUser(user) {
    window.currentUser = user;
    if (user) document.body?.classList.remove("auth-pending");
    window.dispatchEvent(new CustomEvent("pixel-auth-ready"));
}

function guestUser() {
    return { id: "guest-user", email: "guest@pixel.local", user_metadata: { display_name: "Guest Explorer" } };
}

async function checkSession() {
    try {
        if (!client) {
            console.warn("[Pixel Auth] Supabase client not initialized.");
            if (localStorage.getItem("pixel-guest") === "true") {
                setCurrentUser(guestUser());
            } else {
                redirectToLogin();
            }
            return;
        }

        const { data, error } = await client.auth.getSession();

        if (error) throw error;

        if (data && data.session) {
            setCurrentUser(data.session.user);
            localStorage.removeItem("pixel-guest");
            console.log("[Pixel Auth] Active session restored.");
            finishAuthRedirect();
            return;
        }

        // Check if user chose to continue as guest
        const isGuest = localStorage.getItem("pixel-guest") === "true";
        if (isGuest) {
            setCurrentUser(guestUser());
            console.log("[Pixel Auth] Running in Guest mode.");
            finishAuthRedirect();
            return;
        }

        // Otherwise redirect to login
        redirectToLogin();

    } catch (err) {
        console.error("[Pixel Auth] Unexpected error during session check:", err);
        if (localStorage.getItem("pixel-guest") === "true") {
            setCurrentUser(guestUser());
        } else {
            redirectToLogin({ session: "unavailable" });
        }
    }
}

client?.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
        setCurrentUser(session.user);
        localStorage.removeItem("pixel-guest");
        return;
    }
    if (event === "SIGNED_OUT") {
        const guestMode = localStorage.getItem("pixel-guest") === "true";
        setCurrentUser(guestMode ? guestUser() : null);
        if (!guestMode) {
            document.body?.classList.add("auth-pending");
            redirectToLogin();
        }
    }
});

checkSession();
