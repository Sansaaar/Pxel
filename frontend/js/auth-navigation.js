(function () {
    const authPaths = new Set([
        "/login", "/login.html",
        "/signup", "/signup.html",
        "/forgot-password", "/forgot-password.html"
    ]);

    function normalizeReturnTo(value) {
        if (!value) return null;
        try {
            const url = new URL(value, window.location.origin);
            const pathname = url.pathname.replace(/\/$/, "") || "/";
            if (url.origin !== window.location.origin || authPaths.has(pathname)) return null;
            return `${url.pathname}${url.search}${url.hash}`;
        } catch {
            return null;
        }
    }

    function requestedReturnTo() {
        return normalizeReturnTo(new URL(window.location.href).searchParams.get("returnTo"));
    }

    function currentAppPath() {
        const current = new URL(window.location.href);
        const pathname = current.pathname.replace(/\/$/, "") || "/";
        if (authPaths.has(pathname)) return requestedReturnTo() || "/";
        return normalizeReturnTo(`${current.pathname}${current.search}${current.hash}`) || "/";
    }

    function authPageUrl(path, returnTo, extraParams = {}) {
        const url = new URL(path, window.location.origin);
        if (url.origin !== window.location.origin) return "/login.html";
        const safeReturnTo = normalizeReturnTo(returnTo);
        if (safeReturnTo) url.searchParams.set("returnTo", safeReturnTo);
        for (const [key, value] of Object.entries(extraParams)) {
            if (value != null) url.searchParams.set(key, String(value));
        }
        return `${url.pathname}${url.search}${url.hash}`;
    }

    function oauthCallbackUrl() {
        const url = new URL("/index.html", window.location.origin);
        const returnTo = requestedReturnTo();
        if (returnTo) url.searchParams.set("returnTo", returnTo);
        return url.href;
    }

    window.pixelAuthNavigation = {
        requestedReturnTo,
        currentAppPath,
        destinationAfterAuth: () => requestedReturnTo() || "/",
        authPageUrl,
        loginUrl: (returnTo, extraParams) => authPageUrl("/login.html", returnTo, extraParams),
        oauthCallbackUrl
    };
})();
