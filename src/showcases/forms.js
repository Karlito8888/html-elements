const form = document.getElementById("signup");
const seats = document.getElementById("seats");
const required = [...form.querySelectorAll("[required]")];

// output shows a computed result; progress counts the required fields already valid.
form.addEventListener("input", () => {
  document.getElementById("seats-out").value = seats.value;
  document.getElementById("total").value = seats.value * 20;
  document.getElementById("filled").value = required.filter((field) => field.checkValidity()).length;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  document.getElementById("thanks").hidden = false;
});
