const client = window.supabaseClient;

const form = document.getElementById("loginForm");
const email = document.getElementById("email");
const password = document.getElementById("password");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const togglePassword = document.getElementById("togglePassword");
const loginBtn = document.getElementById("loginSubmit");
const passwordResetForm = document.getElementById("updatePasswordForm");
const passwordResetBtn = passwordResetForm?.querySelector(".login-btn");
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
    const signupLink = document.querySelector(".signup-text a");
    if (signupLink) signupLink.href = authNavigation.authPageUrl("/signup.html", returnTo);
    const forgotLink = document.querySelector('a[href$="forgot-password.html"]');
    if (forgotLink) forgotLink.href = authNavigation.authPageUrl("/forgot-password.html", returnTo);
}

preserveReturnToLinks();

function authErrorMessage(error, context = "login") {
    const detail = `${error?.status || ""} ${error?.code || ""} ${error?.message || ""}`.toLowerCase();
    if (/too many|rate limit|\b429\b/.test(detail)) {
        return "Too many sign-in attempts. Wait a little, then try again.";
    }
    if (/fetch failed|failed to fetch|network|timeout|connection|econn|service unavailable|\b503\b/.test(detail)) {
        return "Could not reach the account service. Check your connection and try again.";
    }
    return window.pixelAuthErrorMessage?.(error, context)
        || "Sign-in is unavailable right now. Please try again.";
}

function showError(message) {
    if (!errorBanner) return;
    errorBanner.textContent = message;
    errorBanner.hidden = false;
}

function clearError() {
    if (!errorBanner) return;
    errorBanner.textContent = "";
    errorBanner.hidden = true;
}

function setFieldError(field, errorElement, message) {
    field?.setAttribute("aria-invalid", "true");
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.hidden = false;
    }
}

function clearFieldErrors() {
    for (const [field, errorElement] of [[email, emailError], [password, passwordError]]) {
        field?.removeAttribute("aria-invalid");
        if (errorElement) {
            errorElement.textContent = "";
            errorElement.hidden = true;
        }
    }
}

function setButtonLoading(button, message) {
    if (!button) return;
    if (!button.dataset.idleMarkup) button.dataset.idleMarkup = button.innerHTML;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>${message}</span>`;
}

function restoreButton(button) {
    if (!button) return;
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.idleMarkup) {
        button.innerHTML = button.dataset.idleMarkup;
        delete button.dataset.idleMarkup;
    }
}

function finishButton(button, message) {
    if (!button) return;
    button.setAttribute("aria-busy", "false");
    button.textContent = message;
}

function showPasswordReset() {
    if (form) form.hidden = true;
    if (passwordResetForm) passwordResetForm.hidden = false;

    const heading = document.getElementById("loginHeading");
    const description = document.getElementById("loginDescription");
    if (heading) heading.textContent = "Choose a new password";
    if (description) description.textContent = "Use a strong password you have not used before.";

    googleBtn?.setAttribute("hidden", "");
    guestBtn?.setAttribute("hidden", "");
    document.querySelector(".divider")?.setAttribute("hidden", "");
    document.querySelector(".signup-text")?.setAttribute("hidden", "");
    document.getElementById("newPassword")?.focus();
}

client?.auth.onAuthStateChange(event => {
    if (event === "PASSWORD_RECOVERY") showPasswordReset();
});

const authHash = new URLSearchParams(window.location.hash.slice(1));
if (authHash.has("error") || authHash.has("error_code")) {
    showError(authErrorMessage({
        code: authHash.get("error_code"),
        message: authHash.get("error_description")
    }, "password"));
}

let passwordResetPending = false;
passwordResetForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (passwordResetPending) return;
    clearError();

    const nextPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmNewPassword").value;
    if (nextPassword.length < 8) {
        showError("Choose a password with at least 8 characters.");
        document.getElementById("newPassword").focus();
        return;
    }
    if (nextPassword !== confirmPassword) {
        showError("The passwords do not match.");
        document.getElementById("confirmNewPassword").focus();
        return;
    }

    passwordResetPending = true;
    setButtonLoading(passwordResetBtn, "Updating password...");
    try {
        if (!client?.auth) throw new Error("Authentication service unavailable");
        const { error } = await client.auth.updateUser({ password: nextPassword });
        if (error) throw error;
        finishButton(passwordResetBtn, "Password updated");
        window.setTimeout(() => { window.location.href = appAfterAuthUrl(); }, 700);
    } catch (error) {
        passwordResetPending = false;
        restoreButton(passwordResetBtn);
        showError(authErrorMessage(error, "password"));
    }
});

if (togglePassword && password) {
    togglePassword.addEventListener("click", () => {
        const show = password.type === "password";
        password.type = show ? "text" : "password";
        togglePassword.setAttribute("aria-label", show ? "Hide password" : "Show password");
        togglePassword.setAttribute("title", show ? "Hide password" : "Show password");
        togglePassword.setAttribute("aria-pressed", String(show));
        togglePassword.innerHTML = show
            ? '<i class="fa-regular fa-eye-slash" aria-hidden="true"></i>'
            : '<i class="fa-regular fa-eye" aria-hidden="true"></i>';
    });
}

function validEmail(address) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

email?.addEventListener("input", () => {
    if (emailError?.hidden || !validEmail(email.value.trim())) return;
    email.removeAttribute("aria-invalid");
    emailError.textContent = "";
    emailError.hidden = true;
});

password?.addEventListener("input", () => {
    if (passwordError?.hidden || !password.value) return;
    password.removeAttribute("aria-invalid");
    passwordError.textContent = "";
    passwordError.hidden = true;
});

function shake(element) {
    if (!element) return;
    element.classList.remove("shake");
    void element.offsetWidth;
    element.classList.add("shake");
    window.setTimeout(() => element.classList.remove("shake"), 350);
}

let signInPending = false;
form?.addEventListener("submit", async event => {
    event.preventDefault();
    if (signInPending) return;

    clearError();
    clearFieldErrors();

    const userEmail = email.value.trim();
    const userPassword = password.value;

    if (!userEmail) {
        setFieldError(email, emailError, "Enter your email address.");
        email.focus();
        return;
    }
    if (!validEmail(userEmail)) {
        setFieldError(email, emailError, "Enter a valid email address.");
        email.focus();
        return;
    }
    if (!userPassword) {
        setFieldError(password, passwordError, "Enter your password.");
        password.focus();
        return;
    }
    if (!client?.auth) {
        showError("The sign-in service is unavailable right now. Please refresh and try again.");
        return;
    }

    signInPending = true;
    form.setAttribute("aria-busy", "true");
    setButtonLoading(loginBtn, "Signing in...");

    try {
        const { error } = await client.auth.signInWithPassword({
            email: userEmail,
            password: userPassword
        });
        if (error) throw error;

        try {
            localStorage.removeItem("pixel-guest");
        } catch {
            // A storage restriction should not prevent redirecting an authenticated user.
        }
        form.setAttribute("aria-busy", "false");
        finishButton(loginBtn, "Signed in");
        window.setTimeout(() => { window.location.href = appAfterAuthUrl(); }, 600);
    } catch (error) {
        signInPending = false;
        form.removeAttribute("aria-busy");
        restoreButton(loginBtn);
        showError(authErrorMessage(error));
    }
});

let oauthPending = false;
googleBtn?.addEventListener("click", async () => {
    if (oauthPending) return;
    clearError();
    if (!client?.auth) {
        showError("Google sign-in is unavailable right now. Please try again later.");
        return;
    }

    oauthPending = true;
    setButtonLoading(googleBtn, "Connecting to Google...");
    try {
        const redirectUrl = authNavigation?.oauthCallbackUrl() || `${window.location.origin}/index.html`;
        const { error } = await client.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: redirectUrl }
        });
        if (error) throw error;
    } catch (error) {
        oauthPending = false;
        restoreButton(googleBtn);
        showError(authErrorMessage(error));
    }
});

guestBtn?.addEventListener("click", () => {
    clearError();
    try {
        localStorage.setItem("pixel-guest", "true");
    } catch {
        showError("Guest mode needs browser storage enabled. Please allow site storage and try again.");
        return;
    }
    setButtonLoading(guestBtn, "Opening Pixel...");
    window.location.href = appAfterAuthUrl();
});
