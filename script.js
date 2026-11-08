const form = document.querySelector('#estimate-form');
const resultPanel = document.querySelector('#result-panel');

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function estimateHomeValue({ location, propertyType, squareFeet, bedrooms, bathrooms }) {
  const marketMultipliers = [
    { match: /san francisco|new york|manhattan|brooklyn|boston|seattle|los angeles|santa monica/i, factor: 1.8 },
    { match: /san jose|palo alto|oakland|san diego|washington|honolulu/i, factor: 1.55 },
    { match: /austin|denver|portland|miami|chicago|philadelphia|nashville/i, factor: 1.2 },
    { match: /cleveland|detroit|memphis|toledo|wichita|oklahoma city/i, factor: 0.78 },
  ];

  const marketFactor = marketMultipliers.find(({ match }) => match.test(location))?.factor ?? 1;
  const typeFactor = { single: 1, townhouse: 0.92, condo: 0.83 }[propertyType];
  const sizeBase = squareFeet * 225;
  const bedroomAdjustment = (bedrooms - 3) * 12500;
  const bathroomAdjustment = (bathrooms - 2) * 9500;
  const midpoint = Math.max(70000, (sizeBase + bedroomAdjustment + bathroomAdjustment) * typeFactor * marketFactor);
  const low = Math.round(midpoint * 0.87 / 5000) * 5000;
  const high = Math.round(midpoint * 1.13 / 5000) * 5000;

  return { midpoint: Math.round(midpoint / 500) * 500, low, high };
}

function formatLocation(location) {
  return location.replace(/\s+/g, ' ').trim().replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const values = {
    location: document.querySelector('#location').value.trim(),
    propertyType: document.querySelector('#property-type').value,
    squareFeet: Number(document.querySelector('#square-feet').value),
    bedrooms: Number(document.querySelector('#bedrooms').value),
    bathrooms: Number(document.querySelector('#bathrooms').value),
  };

  const { midpoint, low, high } = estimateHomeValue(values);
  document.querySelector('#result-price').textContent = currency.format(midpoint);
  document.querySelector('#range-low').textContent = currency.format(low);
  document.querySelector('#range-high').textContent = currency.format(high);
  document.querySelector('#result-address').textContent = formatLocation(values.location);
  document.querySelector('.result-welcome').hidden = true;
  document.querySelector('.result-content').hidden = false;
  resultPanel.classList.add('has-result');
  document.querySelector('#floating-price').textContent = currency.format(midpoint);
  document.querySelector('.range-marker').style.left = `${(midpoint - low) / (high - low) * 100}%`;
});
