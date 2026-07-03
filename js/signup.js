// ==========================================
// PIXEL AI - SIGNUP
// ==========================================

const client = window.supabaseClient;

// ---------- FORM ----------

const form = document.getElementById("signupForm");

const username = document.getElementById("username");

const email = document.getElementById("email");

const password = document.getElementById("password");

const confirmPassword = document.getElementById("confirmPassword");

const signupBtn = document.querySelector(".login-btn");

// ---------- PASSWORD TOGGLE ----------

const togglePassword =
document.getElementById("togglePassword");

const toggleConfirm =
document.getElementById("toggleConfirmPassword");

// ---------- PASSWORD STRENGTH ----------

const strengthFill =
document.querySelector(".strength-fill");

const strengthText =
document.querySelector(".strength-text");

// ==========================================
// SHOW / HIDE PASSWORD
// ==========================================

togglePassword.addEventListener("click",()=>{

    if(password.type==="password"){

        password.type="text";

        togglePassword.innerHTML=
        '<i class="fa-regular fa-eye-slash"></i>';

    }

    else{

        password.type="password";

        togglePassword.innerHTML=
        '<i class="fa-regular fa-eye"></i>';

    }

});

toggleConfirm.addEventListener("click",()=>{

    if(confirmPassword.type==="password"){

        confirmPassword.type="text";

        toggleConfirm.innerHTML=
        '<i class="fa-regular fa-eye-slash"></i>';

    }

    else{

        confirmPassword.type="password";

        toggleConfirm.innerHTML=
        '<i class="fa-regular fa-eye"></i>';

    }

});

// ==========================================
// EMAIL VALIDATION
// ==========================================

function validEmail(mail){

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);


}

// ==========================================
// USERNAME VALIDATION
// ==========================================

function validUsername(name){

    return /^[a-zA-Z0-9_]{3,20}$/.test(name);

}


// ==========================================
// PASSWORD STRENGTH
// ==========================================

password.addEventListener("input",()=>{

    let score=0;

    const value=password.value;

    if(value.length>=8) score++;

    if(/[A-Z]/.test(value)) score++;

    if(/[0-9]/.test(value)) score++;

    if(/[^A-Za-z0-9]/.test(value)) score++;

    const percent=(score/4)*100;

    strengthFill.style.width=percent+"%";

    switch(score){

        case 0:

        case 1:

            strengthFill.style.background="#FF4D4D";

            strengthText.innerHTML="Weak Password";

            break;

        case 2:

            strengthFill.style.background="#FFA500";

            strengthText.innerHTML="Fair Password";

            break;

        case 3:

            strengthFill.style.background="#D4AF37";

            strengthText.innerHTML="Good Password";

            break;

        case 4:

            strengthFill.style.background="#46D160";

            strengthText.innerHTML="Strong Password";

            break;

    }

});


// ==========================================
// SHAKE ANIMATION
// ==========================================

function shake(element){

    element.classList.add("shake");

    setTimeout(()=>{

        element.classList.remove("shake");

    },350);

}



// ==========================================
// ERROR MESSAGE
// ==========================================

function showError(input,message){

    removeError(input);

    const error=document.createElement("small");

    error.className="error-message";

    error.innerText=message;

    input.parentElement.appendChild(error);

    input.style.borderColor="#FF5A5A";

}

function removeError(input){

    const old=input.parentElement.querySelector(".error-message");

    if(old){

        old.remove();

    }

    input.style.borderColor="";

}

// ==========================================
// FORM VALIDATION
// ==========================================

form.addEventListener("submit", async (e) => {

    e.preventDefault();

    removeError(username);

    removeError(email);

    removeError(password);

    removeError(confirmPassword);

    let valid=true;

    // Username

    if(username.value.trim()===""){

        showError(username,"Username is required");

        shake(username);

        valid=false;

    }

    else if(!validUsername(username.value.trim())){

        showError(username,"3-20 letters, numbers or _ only");

        shake(username);

        valid=false;

    }

    // Email

    if(email.value.trim()===""){

        showError(email,"Email is required");

        shake(email);

        valid=false;

    }

    else if(!validEmail(email.value.trim())){

        showError(email,"Invalid email");

        shake(email);

        valid=false;

    }

    // Password

    if(password.value.length<8){

        showError(password,"Minimum 8 characters");

        shake(password);

        valid=false;

    }

    // Confirm

    if(confirmPassword.value!==password.value){

        showError(confirmPassword,"Passwords don't match");

        shake(confirmPassword);

        valid=false;

    }

    if(!valid){

        return;

    }

    try {

    signupBtn.disabled = true;

    signupBtn.innerHTML = "Creating Account...";

    const { data, error } = await client.auth.signUp({

        email: email.value.trim(),

        password: password.value.trim(),

        options: {

            data: {

                username: username.value.trim()

            }

        }

    });

    if(error){

        throw error;

    }

    alert("🎉 Account created!\n\nPlease verify your email before logging in.");

    window.location.href = "login.html";

}

catch (error) {

    console.error("Signup Error:", error);
    console.log("Message:", error.message);
    console.log("Status:", error.status);
    console.log("Full Error:", JSON.stringify(error, null, 2));

    alert(error.message);

}



finally{

    signupBtn.disabled = false;

    signupBtn.innerHTML = "Create Account";

}

});

// ==========================================
// SIGNUP BUTTON
// ==========================================

function signupSuccess(){

    signupBtn.disabled=true;

    signupBtn.innerHTML="Creating Account...";

    setTimeout(()=>{

        signupBtn.innerHTML="Account Created ✓";

        signupBtn.style.background="#46D160";

    },1800);

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
