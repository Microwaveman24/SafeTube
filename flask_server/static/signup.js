document.getElementById("signupForm").addEventListener("submit", async function (e){
    e.preventDefault();//assuming jsut means there has to be content in the site

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email : email, password : password})
    });

    const data = await res.json();
    (data.error);
    
    
    if (res.ok) {
        window.location.href = "/login"
    }

})

document.getElementById("login").addEventListener("click", () => {
    window.location.href = "/login"
})

