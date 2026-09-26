(function () {
    window.pixelAuthErrorMessage = function (error, context = "auth") {
        const detail = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
        if (/invalid_credentials|invalid login credentials|invalid email or password/.test(detail)) {
            return "Email or password is incorrect.";
        }
        if (/email_not_confirmed|email not confirmed/.test(detail)) {
            return "Verify your email from the message we sent, then sign in.";
        }
        if (/user_already_exists|email_exists|already registered/.test(detail)) {
            return "An account with this email already exists. Sign in instead.";
        }
        if (/weak_password|password should be at least|password is too weak/.test(detail)) {
            return "Choose a stronger password with at least 8 characters.";
        }
        if (/otp_expired|token has expired|link is invalid or has expired|expired.*link/.test(detail)) {
            return "This link has expired. Request a new password-reset email.";
        }
        if (/over_email_send_rate_limit|rate limit/.test(detail)) {
            return "Too many attempts. Wait a little, then try again.";
        }
        if (/fetch failed|network|timeout/.test(detail)) {
            return "Could not reach the account service. Check your connection and try again.";
        }
        if (context === "reset") return "Could not send the reset email. Check the address and try again.";
        if (context === "signup") return "Could not create the account. Check your details and try again.";
        if (context === "password") return "Could not update the password. Request a new reset link and try again.";
        return "Sign-in failed. Check your details and try again.";
    };
})();
