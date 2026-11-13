// BricoMission Keycloak login theme: show/hide password toggles.
// Each toggle is <button data-password-toggle aria-controls="<input id>"> with
// data-label-show / data-label-hide (localized accessible names from the message files).
document.querySelectorAll('[data-password-toggle]').forEach((button) => {
  const input = document.getElementById(button.getAttribute('aria-controls'));
  if (!input) return;
  button.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(show));
    button.setAttribute('aria-label', show ? button.dataset.labelHide : button.dataset.labelShow);
  });
});
