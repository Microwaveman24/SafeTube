document.getElementById("childForm").addEventListener("submit", async function (e) {
  e.preventDefault();

  const email = document.getElementById("childEmail").value;

  const res = await fetch("/auth/create_child", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });

  const data = await res.json();
  alert(data.message);

  if (res.ok) {
    document.getElementById("childEmail").value = "";
  }
});
