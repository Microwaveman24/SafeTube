const token = localStorage.getItem("access_token");

fetch("/api/dashboard", {
  headers: {
    Authorization: `Bearer ${token}`
  }
});
