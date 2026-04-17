(function () {
    "use strict";

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
})();
