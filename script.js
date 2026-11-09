const form = document.querySelector('#estimate-form');
const resultPanel = document.querySelector('#result-panel');
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function formatLocation(location) {
  return location.replace(/\s+/g, ' ').trim().replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/estimate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: document.querySelector('#location').value.trim(),
        area: Number(document.querySelector('#square-feet').value),
        bedrooms: Number(document.querySelector('#bedrooms').value),
        bathrooms: Number(document.querySelector('#bathrooms').value),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to calculate an estimate.');
    document.querySelector('#result-price').textContent = currency.format(result.midpoint);
    document.querySelector('#range-low').textContent = currency.format(result.low);
    document.querySelector('#range-high').textContent = currency.format(result.high);
    document.querySelector('#result-address').textContent = formatLocation(document.querySelector('#location').value);
    document.querySelector('.result-welcome').hidden = true;
    document.querySelector('.result-content').hidden = false;
    resultPanel.classList.add('has-result');
    document.querySelector('#floating-price').textContent = currency.format(result.midpoint);
    document.querySelector('.range-marker').style.left = '50%';
  } catch (error) {
    window.alert(error.message);
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});
