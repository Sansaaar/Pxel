// ==========================================
// Pixel AI 2.0: Login Manager
// ==========================================

const client = window.supabaseClient;

const form = document.getElementById("loginForm");
const email = document.getElementById("email");
const password = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const loginBtn = document.querySelector(".login-btn");
const googleBtn = document.getElementById("googleLogin");
const guestBtn = document.getElementById("guestLogin");
const errorBanner = document.getElementById("authError");

function showError(msg) {
    if (errorBanner) {
        errorBanner.textContent = msg;
        errorBanner.style.display = "block";
    } else {
        alert(msg);
    }
}

function clearError() {
    if (errorBanner) {
        errorBanner.textContent = "";
        errorBanner.style.display = "none";
    }
}

// Password toggle
if (togglePassword && password) {
    togglePassword.addEventListener("click", () => {
        if (password.type === "password") {
            password.type = "text";
            togglePassword.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
        } else {
            password.type = "password";
            togglePassword.innerHTML = '<i class="fa-regular fa-eye"></i>';
        }
    });
}

function validEmail(emailAddress) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress);
}

function shake(element) {
    element.classList.add("shake");
    setTimeout(() => {
        element.classList.remove("shake");
    }, 350);
}

// Form Submit
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const userEmail = email.value.trim();
    const userPassword = password.value.trim();

    if (!userEmail) {
        email.focus();
        shake(email);
        return;
    }

    if (!validEmail(userEmail)) {
        showError("Please enter a valid email address.");
        shake(email);
        return;
    }

    if (!userPassword) {
        password.focus();
        shake(password);
        return;
    }

    try {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';

        const { data, error } = await client.auth.signInWithPassword({
            email: userEmail,
            password: userPassword
        });

        if (error) {
            throw error;
        }

        loginBtn.innerHTML = "Success ✓";
        loginBtn.style.background = "#D4AF37";
        localStorage.removeItem("pixel-guest");

        setTimeout(() => {
            window.location.href = "index.html";
        }, 600);

    } catch (error) {
        console.error("[Pixel Login Error]:", error);
        loginBtn.disabled = false;
        loginBtn.innerHTML = "Sign In";
        loginBtn.style.background = "";
        showError(error.message || "Invalid email or password.");
        shake(form);
    }
});

// Google OAuth
if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
        try {
            clearError();
            const redirectUrl = window.location.origin + window.location.pathname.replace("login.html", "index.html");
            const { error } = await client.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: redirectUrl
                }
            });

            if (error) throw error;
        } catch (error) {
            console.error("[Pixel Google OAuth Error]:", error);
            showError(error.message || "Could not connect to Google sign in.");
        }
    });
}

// Guest Mode Login
if (guestBtn) {
    guestBtn.addEventListener("click", () => {
        localStorage.setItem("pixel-guest", "true");
        window.location.href = "index.html";
    });
}