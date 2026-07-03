const client = window.supabaseClient;

async function checkSession() {

    const { data, error } = await client.auth.getSession();

    if (error) {
        console.error(error);
        return;
    }

    if (!data.session) {

        window.location.href = "login.html";
        return;

    }

    console.log("Logged in as:", data.session.user.email);

}

checkSession();