// =========================================
// Pixel AI Login
// =========================================

const client = window.supabaseClient;
// Elements
const form = document.getElementById("loginForm");

const email = document.getElementById("email");

const password = document.getElementById("password");

const togglePassword = document.getElementById("togglePassword");

const loginBtn = document.querySelector(".login-btn");

// =========================================
// Show / Hide Password
// =========================================

togglePassword.addEventListener("click", () => {

    if(password.type === "password"){

        password.type = "text";

        togglePassword.innerHTML =
        '<i class="fa-regular fa-eye-slash"></i>';

    }

    else{

        password.type = "password";

        togglePassword.innerHTML =
        '<i class="fa-regular fa-eye"></i>';

    }

});

// =========================================
// Email Validation
// =========================================

function validEmail(emailAddress){

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress);

}

// =========================================
// Login Validation
// =========================================

form.addEventListener("submit", async (e) => {

    e.preventDefault();

    const userEmail = email.value.trim();

    const userPassword = password.value.trim();

    if (userEmail === "") {

        email.focus();
        shake(email);
        return;

    }

    if (!validEmail(userEmail)) {

        shake(email);
        return;

    }

    if (userPassword === "") {

        password.focus();
        shake(password);
        return;

    }

    try {

        loginBtn.disabled = true;
        loginBtn.innerHTML = "Signing In...";

        const { data, error } = await client.auth.signInWithPassword({

            email: userEmail,
            password: userPassword

        });

        if (error) {

            throw error;

        }

        loginBtn.innerHTML = "Success ✓";
        loginBtn.style.background = "#46D160";

        setTimeout(() => {

            window.location.href = "index.html";

        }, 1000);

    }
        catch (error) {

    console.error("Signup Error:", error);
    console.log("Message:", error.message);
    console.log("Status:", error.status);
    console.log("Full Error:", JSON.stringify(error, null, 2));

    alert(error.message);

    }
});

// =========================================
// Loading Button
// =========================================


// =========================================
// Shake Effect
// =========================================

function shake(element){

    element.classList.add("shake");

    setTimeout(()=>{

        element.classList.remove("shake");

    },350);

}

// ==========================================
// GOOGLE BUTTON
// ==========================================

const googleBtn = document.getElementById("googleLogin");

googleBtn.addEventListener("click", async () => {

    const { error } = await client.auth.signInWithOAuth({

        provider: "google",

        options: {

            redirectTo: "http://127.0.0.1:5500/frontend/index.html"

        }

    });

    if (error) {

        console.error(error);
        alert(error.message);

    }

});