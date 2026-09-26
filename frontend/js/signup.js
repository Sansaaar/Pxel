// ==========================================
// Pixel AI 2.0: Signup Manager
// ==========================================

const client = window.supabaseClient;

const form = document.getElementById("signupForm");
const username = document.getElementById("username");
const email = document.getElementById("email");
const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");
const signupBtn = document.querySelector(".login-btn");
const togglePassword = document.getElementById("togglePassword");
const toggleConfirm = document.getElementById("toggleConfirmPassword");
const strengthFill = document.querySelector(".strength-fill");
const strengthText = document.querySelector(".strength-text");
const googleBtn = document.getElementById("googleLogin");
const guestBtn = document.getElementById("guestLogin");
const errorBanner = document.getElementById("authError");
const authNavigation = window.pixelAuthNavigation;

function appAfterAuthUrl() {
    return authNavigation?.destinationAfterAuth() || "/";
}

function preserveReturnToLinks() {
    const returnTo = authNavigation?.requestedReturnTo();
    if (!returnTo) return;
    const loginLink = document.querySelector('.signup-text a[href$="login.html"]');
    if (loginLink) loginLink.href = authNavigation.authPageUrl("/login.html", returnTo);
}

preserveReturnToLinks();

function showErrorBanner(msg) {
    if (errorBanner) {
        errorBanner.textContent = msg;
        errorBanner.style.display = "block";
    } else {
        alert(msg);
    }
}

function clearErrorBanner() {
    if (errorBanner) {
        errorBanner.textContent = "";
        errorBanner.style.display = "none";
    }
}

// Password toggles
if (togglePassword && password) {
    togglePassword.addEventListener("click", () => {
        password.type = password.type === "password" ? "text" : "password";
        togglePassword.innerHTML = password.type === "password"
            ? '<i class="fa-regular fa-eye"></i>'
            : '<i class="fa-regular fa-eye-slash"></i>';
    });
}

if (toggleConfirm && confirmPassword) {
    toggleConfirm.addEventListener("click", () => {
        confirmPassword.type = confirmPassword.type === "password" ? "text" : "password";
        toggleConfirm.innerHTML = confirmPassword.type === "password"
            ? '<i class="fa-regular fa-eye"></i>'
            : '<i class="fa-regular fa-eye-slash"></i>';
    });
}

function validEmail(mail) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);
}

function validUsername(name) {
    return /^[a-zA-Z0-9_]{3,20}$/.test(name);
}

// Password strength indicator
if (password && strengthFill && strengthText) {
    password.addEventListener("input", () => {
        let score = 0;
        const val = password.value;

        if (val.length >= 8) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        const percent = (score / 4) * 100;
        strengthFill.style.width = percent + "%";

        switch (score) {
            case 0:
            case 1:
                strengthFill.style.background = "#FF4D4D";
                strengthText.innerText = "Weak Password";
                break;
            case 2:
                strengthFill.style.background = "#FFA500";
                strengthText.innerText = "Fair Password";
                break;
            case 3:
                strengthFill.style.background = "#D4AF37";
                strengthText.innerText = "Good Password";
                break;
            case 4:
                strengthFill.style.background = "#46D160";
                strengthText.innerText = "Strong Password";
                break;
        }
    });
}

function shake(element) {
    element.classList.add("shake");
    setTimeout(() => {
        element.classList.remove("shake");
    }, 350);
}

// Form Submission
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrorBanner();

    const u = username.value.trim();
    const em = email.value.trim();
    const pw = password.value.trim();
    const cpw = confirmPassword.value.trim();

    if (!u || !validUsername(u)) {
        showErrorBanner("Username must be 3-20 letters, numbers, or _ only.");
        shake(username);
        return;
    }

    if (!em || !validEmail(em)) {
        showErrorBanner("Please provide a valid email address.");
        shake(email);
        return;
    }

    if (pw.length < 8) {
        showErrorBanner("Password must be at least 8 characters long.");
        shake(password);
        return;
    }

    if (pw !== cpw) {
        showErrorBanner("Passwords do not match.");
        shake(confirmPassword);
        return;
    }

    try {
        signupBtn.disabled = true;
        signupBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';

        const { data, error } = await client.auth.signUp({
            email: em,
            password: pw,
            options: {
                data: {
                    display_name: u,
                    username: u
                }
            }
        });

        if (error) {
            throw error;
        }

        if (data.session) {
            localStorage.removeItem("pixel-guest");
            signupBtn.textContent = "Account created";
            window.location.href = appAfterAuthUrl();
        } else {
            signupBtn.textContent = "Account created";
            showErrorBanner("Account created. Check your email to verify it, then sign in.");
            setTimeout(() => {
                window.location.href = authNavigation?.loginUrl(authNavigation.destinationAfterAuth()) || "/login.html";
            }, 1800);
        }

    } catch (error) {
        console.error("[Pixel Signup Error]:", error);
        signupBtn.disabled = false;
        signupBtn.innerHTML = "Create Account";
        showErrorBanner(window.pixelAuthErrorMessage(error, "signup"));
        shake(form);
    }
});

// Google OAuth
if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
        try {
            clearErrorBanner();
            const redirectUrl = authNavigation?.oauthCallbackUrl() || `${window.location.origin}/index.html`;
            const { error } = await client.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: redirectUrl
                }
            });

            if (error) throw error;
        } catch (error) {
            console.error("[Pixel Google OAuth Error]:", error);
            showErrorBanner(window.pixelAuthErrorMessage(error, "signup"));
        }
    });
}

// Guest Mode Login
if (guestBtn) {
    guestBtn.addEventListener("click", () => {
        localStorage.setItem("pixel-guest", "true");
        window.location.href = appAfterAuthUrl();
    });
}
