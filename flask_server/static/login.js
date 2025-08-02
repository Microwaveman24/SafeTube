document.getElementById("loginForm").addEventListener("submit", async function (e){
    e.preventDefault();

    const email = document.getElementById("email")
    const password = document.getElementById("password")

    const res = await fetch("/auth/login",{
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email, password})
    });

    const data = await res.json
    alert(data.message)
    if(res.ok){
        window.location.href = "../html_pages/dashboard.html"
    }
    }
    )
