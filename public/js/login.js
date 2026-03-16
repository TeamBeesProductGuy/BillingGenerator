(function () {
    "use strict";

    window.switchAuthTab = function (tab) {
        var loginForm = document.getElementById("loginForm");
        var signupForm = document.getElementById("signupForm");
        var tabLogin = document.getElementById("tabLogin");
        var tabSignup = document.getElementById("tabSignup");
        var authError = document.getElementById("authError");

        if (authError) authError.classList.add("hidden");

        if (tab === "login") {
            loginForm.classList.remove("hidden");
            signupForm.classList.add("hidden");
            tabLogin.className = "flex-1 py-2 rounded-lg text-sm font-semibold transition-all bg-primary text-on-primary-fixed";
            tabSignup.className = "flex-1 py-2 rounded-lg text-sm font-semibold transition-all text-on-surface-variant hover:text-on-surface";
        } else {
            loginForm.classList.add("hidden");
            signupForm.classList.remove("hidden");
            tabSignup.className = "flex-1 py-2 rounded-lg text-sm font-semibold transition-all bg-primary text-on-primary-fixed";
            tabLogin.className = "flex-1 py-2 rounded-lg text-sm font-semibold transition-all text-on-surface-variant hover:text-on-surface";
        }
    };

    function showAuthError(msg) {
        var el = document.getElementById("authError");
        var text = document.getElementById("authErrorText");
        if (el && text) {
            text.textContent = msg;
            el.classList.remove("hidden");
        }
    }

    window.handleLogin = async function (e) {
        e.preventDefault();
        var email = document.getElementById("loginEmail").value.trim();
        var password = document.getElementById("loginPassword").value;
        var btn = document.getElementById("loginBtn");

        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner" style="padding:0"></div>';

        try {
            var result = await window._supabaseClient.auth.signInWithPassword({ email: email, password: password });
            if (result.error) {
                showAuthError(result.error.message);
                btn.disabled = false;
                btn.innerHTML = '<span class="material-symbols-outlined text-xl">login</span> Sign In';
                return;
            }
            // Session is set, navigate to app
            window.onAuthSuccess(result.data.session);
        } catch (err) {
            showAuthError(err.message || "Login failed");
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined text-xl">login</span> Sign In';
        }
    };

    window.handleSignup = async function (e) {
        e.preventDefault();
        var email = document.getElementById("signupEmail").value.trim();
        var password = document.getElementById("signupPassword").value;
        var confirm = document.getElementById("signupPasswordConfirm").value;
        var btn = document.getElementById("signupBtn");

        if (password !== confirm) {
            showAuthError("Passwords do not match");
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner" style="padding:0"></div>';

        try {
            var result = await window._supabaseClient.auth.signUp({ email: email, password: password });
            if (result.error) {
                showAuthError(result.error.message);
                btn.disabled = false;
                btn.innerHTML = '<span class="material-symbols-outlined text-xl">person_add</span> Create Account';
                return;
            }

            if (result.data.session) {
                window.onAuthSuccess(result.data.session);
            } else {
                // Email confirmation required
                showAuthError("Check your email to confirm your account, then sign in.");
                btn.disabled = false;
                btn.innerHTML = '<span class="material-symbols-outlined text-xl">person_add</span> Create Account';
                switchAuthTab("login");
            }
        } catch (err) {
            showAuthError(err.message || "Signup failed");
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined text-xl">person_add</span> Create Account';
        }
    };
})();
