document.querySelectorAll('[data-account-form]').forEach((form) => {
  const button = form.querySelector('button[type="submit"]');
  const status = document.createElement('p');
  status.className = 'account-subtitle';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  form.append(status);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    status.textContent = '';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const data = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch(form.querySelector('[name="name"]') ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), credentials: 'same-origin',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Authentication failed.');
      status.textContent = `You’re signed in${result.user?.name ? `, ${result.user.name}` : ''}. Redirecting…`;
      window.location.assign('index.html');
    } catch (error) {
      status.textContent = error.message || 'Could not connect to the server. Start it with node server.js and try again.';
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });
});
