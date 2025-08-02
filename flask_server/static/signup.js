document.getElementById("signupForm").addEventListener("submit", async function (e){
    e.preventDefault();//assuming jsut means there has to be content in the site

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch("/auth/signup", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email, password})
    });

    const data = await res.json
    alert(data.message);

    if (res.ok) {
        window.location.href = "../html_pages/login"
    }

})