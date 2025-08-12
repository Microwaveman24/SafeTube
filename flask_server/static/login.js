document.getElementById("loginForm").addEventListener("submit", async function (e){
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch("/api/auth/login",{
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email : email , password : password})
    });

    const data = await res.json();
    //alert(data.message)
    if(res.ok){
        window.location.href = "/dashboard"
    }
    }
    )
